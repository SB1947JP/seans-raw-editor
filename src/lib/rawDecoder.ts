import LibRaw from 'libraw-wasm';
import type { LibRawImageData, Metadata } from 'libraw-wasm';
import { DecodedImage, RawMetadata } from '../types';

const BASE_SETTINGS = {
  useCameraWb: true, // as-shot white balance, not an auto-computed guess
  useCameraMatrix: 3, // always prefer the camera's own embedded colour matrix over LibRaw's generic fallback
  outputBps: 16,
  outputColor: 1, // sRGB
  highlight: 0, // clip; recovered highlights are merged in separately, see reconstructHighlights()
  noAutoBright: true, // no automatic exposure "improvement" — faithful to the as-shot exposure
} as const;

function toDecodedImage(img: LibRawImageData): DecodedImage {
  return {
    data: img.data,
    width: img.width,
    height: img.height,
    bitsPerSample: img.bits === 16 ? 16 : 8,
  };
}

function toRawMetadata(meta: Metadata | undefined): RawMetadata {
  if (!meta) return {};
  return {
    make: meta.camera_make,
    model: meta.camera_model,
    iso: meta.iso_speed,
    shutter: meta.shutter,
    aperture: meta.aperture,
    focalLength: meta.focal_len,
    timestamp: meta.timestamp ? meta.timestamp.getTime() : undefined,
    colors: meta.colors,
  };
}

// --- Highlight reconstruction -------------------------------------------------
//
// LibRaw's blend mode (highlight: 2) recovers gradation in pixels where only
// some channels clipped, by rebuilding the clipped channels from the ones that
// survived. But it can't be used as the primary decode: to make room for the
// recovered above-white data it rescales the whole image darker by the shot's
// maximum white-balance gain — a factor that varies per image (measured ~1.1
// stops on an LX3 frame vs ~1.6 stops on a Leica SL2-S frame), which would
// wreck the faithful default rendering.
//
// So reconstruction is a merge instead, in the spirit of darktable's
// "reconstruct in place" philosophy: decode faithfully (clipped), and only if
// the frame actually contains clipped pixels, decode a second time in blend
// mode, measure the blend decode's global darkening factor empirically from
// unclipped midtones (median linear ratio — no LibRaw internals assumed), and
// splice the re-anchored recovered data into just the clipped pixels. Every
// unclipped pixel keeps its bit-exact faithful value.

const CLIP16 = 65000; // ≥ this in any channel counts as clipped (white is 65535, demosaic wobbles a little)

let srgbToLinearLut: Float32Array | null = null;
function getSrgbToLinearLut(): Float32Array {
  if (!srgbToLinearLut) {
    srgbToLinearLut = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) {
      const c = i / 65535;
      srgbToLinearLut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
  }
  return srgbToLinearLut;
}

function linearToSrgb16(l: number): number {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(65535, Math.round(c * 65535)));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Fraction of pixels with a clipped channel (strided sample for speed). */
function clippedFraction(image: DecodedImage): number {
  const data = image.data as Uint16Array;
  const pixelCount = image.width * image.height;
  const stride = Math.max(1, Math.floor(pixelCount / 200000));
  let clipped = 0;
  let sampled = 0;
  for (let i = 0; i < pixelCount; i += stride) {
    const o = i * 3;
    if (data[o] >= CLIP16 || data[o + 1] >= CLIP16 || data[o + 2] >= CLIP16) clipped++;
    sampled++;
  }
  return clipped / sampled;
}

/**
 * Splice blend-mode recovered highlights into the faithful base decode.
 * Mutates and returns `base`'s buffer.
 */
function mergeRecoveredHighlights(base: DecodedImage, blend: DecodedImage): DecodedImage {
  const b0 = base.data as Uint16Array;
  const b2 = blend.data as Uint16Array;
  if (b0.length !== b2.length) return base;
  const lut = getSrgbToLinearLut();
  const pixelCount = base.width * base.height;

  // Estimate the blend decode's global darkening factor k (base = blend × k in
  // linear light) as a median of per-pixel green-channel ratios over unclipped
  // midtones. Empirical and robust — assumes nothing about LibRaw's scaling.
  const ratios: number[] = [];
  const stride = Math.max(1, Math.floor(pixelCount / 30000));
  for (let i = 0; i < pixelCount && ratios.length < 30000; i += stride) {
    const o = i * 3;
    const g0 = b0[o + 1];
    const g2 = b2[o + 1];
    if (g0 > 3000 && g0 < 60000 && g2 > 200) {
      ratios.push(lut[g0] / lut[g2]);
    }
  }
  if (ratios.length < 500) return base; // not enough signal to anchor safely
  ratios.sort((a, b) => a - b);
  const k = Math.min(8, Math.max(1, ratios[ratios.length >> 1]));

  // Shoulder that maps recovered linear values [KNEE .. k] into [KNEE .. 1]:
  // identity below the knee, slope 1 at the knee (C1, no visible seam), and
  // the maximum possible recovered value lands exactly on white. Recovered
  // gradation therefore lives in the top ~20 8-bit levels instead of being a
  // flat white blob — which is the entire point.
  const KNEE = 0.8;
  const emax = Math.max(k - KNEE, 0.05);
  const cShape = (1 - KNEE) / emax;
  const shoulder = (m: number): number => {
    if (m <= KNEE) return m;
    const x = Math.min(1, (m - KNEE) / emax);
    return KNEE + (1 - KNEE) * (x / (x + cShape * (1 - x)));
  };

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 3;
    const m0 = Math.max(b0[o], b0[o + 1], b0[o + 2]);
    // Fade the recovered data in as the faithful pixel approaches clipping, so
    // there is no hard seam between kept and reconstructed pixels.
    const t = smoothstep(0.98, 0.998, m0 / 65535);
    if (t <= 0) continue;

    let lr = lut[b2[o]] * k;
    let lg = lut[b2[o + 1]] * k;
    let lb = lut[b2[o + 2]] * k;
    const m = Math.max(lr, lg, lb);
    if (m > KNEE) {
      // RGB-ratio compression (scale all channels by the same factor) so the
      // rolloff holds hue/saturation, matching the shader's own shoulder.
      const s = shoulder(m) / m;
      lr *= s;
      lg *= s;
      lb *= s;
    }
    const outR = linearToSrgb16(Math.min(1, lr));
    const outG = linearToSrgb16(Math.min(1, lg));
    const outB = linearToSrgb16(Math.min(1, lb));
    b0[o] = Math.round(b0[o] + (outR - b0[o]) * t);
    b0[o + 1] = Math.round(b0[o + 1] + (outG - b0[o + 1]) * t);
    b0[o + 2] = Math.round(b0[o + 2] + (outB - b0[o + 2]) * t);
  }
  return base;
}

function abortError(): DOMException {
  return new DOMException('Decode cancelled', 'AbortError');
}

async function decodeWith(bytes: Uint8Array<ArrayBuffer>, settings: Record<string, unknown>, signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
  const raw = new LibRaw();
  // dispose() "terminates the underlying worker and rejects any in-flight
  // calls" (see libraw-wasm's own docs) — exactly the cancellation primitive
  // needed to make a stuck/huge decode abortable from the UI. Guarded so the
  // abort listener and the normal-completion cleanup can't double-dispose.
  let disposed = false;
  const disposeOnce = () => {
    if (!disposed) {
      disposed = true;
      raw.dispose();
    }
  };
  const onAbort = () => disposeOnce();
  signal?.addEventListener('abort', onAbort);
  try {
    // libraw-wasm transfers (detaches) the buffer it's given to its worker,
    // so hand it a copy and keep the caller's original bytes reusable.
    await raw.open(bytes.slice(), settings);
    const [meta, img] = await Promise.all([raw.metadata(), raw.imageData()]);
    if (!img) {
      throw new Error('RAW decode produced no image data (unsupported compression?)');
    }
    return { image: toDecodedImage(img), metadata: toRawMetadata(meta) };
  } catch (err) {
    // A dispose()-triggered rejection surfaces as whatever error the worker
    // teardown produces, not a recognizable "aborted" error — so if the
    // signal is what caused this, report it as a cancellation regardless of
    // what the underlying error says.
    if (signal?.aborted) throw abortError();
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    disposeOnce();
  }
}

async function decode(bytes: Uint8Array<ArrayBuffer>, halfSize: boolean, signal?: AbortSignal) {
  const result = await decodeWith(bytes, { ...BASE_SETTINGS, halfSize }, signal);

  // Only frames that actually clipped pay for the reconstruction decode.
  if (result.image.bitsPerSample === 16 && clippedFraction(result.image) > 0.0005) {
    try {
      const blend = await decodeWith(bytes, { ...BASE_SETTINGS, highlight: 2, halfSize }, signal);
      result.image = mergeRecoveredHighlights(result.image, blend.image);
    } catch (err) {
      // Cancellation must still propagate; reconstruction failing for any
      // other reason is fine to swallow — the faithful base image is usable.
      if (signal?.aborted) throw abortError();
    }
  }
  return result;
}

const SUPPORTED_EXTENSIONS = ['.rw2', '.dng'];

/** Whether a filename has one of the extensions this editor advertises support for. */
export function isSupportedRawFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Maps a decode failure to plain-English text; unrecognized errors fall back to the raw message. */
export function friendlyDecodeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('unsupported') || lower.includes('compression')) {
    return "This file uses a RAW compression format that isn't supported. Try re-exporting it as a standard RW2/DNG.";
  }
  if (lower.includes('no image data') || lower.includes('unpack') || lower.includes('corrupt')) {
    return "Couldn't read this file — it may be corrupted or not a recognized RAW format.";
  }
  if (lower.includes('memory') || lower.includes('allocation') || lower.includes('out of')) {
    return 'Ran out of memory decoding this file. Try closing other tabs, or a smaller RAW file.';
  }
  return raw || 'Failed to decode RAW file.';
}

/** Fast, downscaled decode for interactive editing. */
export function decodePreview(bytes: Uint8Array<ArrayBuffer>, signal?: AbortSignal) {
  return decode(bytes, true, signal);
}

/** Full-resolution decode, used only when exporting. */
export function decodeFull(bytes: Uint8Array<ArrayBuffer>, signal?: AbortSignal) {
  return decode(bytes, false, signal);
}
