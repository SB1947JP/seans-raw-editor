import LibRaw from 'libraw-wasm';
import type { LibRawImageData, Metadata } from 'libraw-wasm';
import { DecodedImage, RawMetadata } from '../types';

const BASE_SETTINGS = {
  useCameraWb: true,
  outputBps: 16,
  outputColor: 1, // sRGB
  highlight: 0,
  noAutoBright: true,
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

async function decode(bytes: Uint8Array<ArrayBuffer>, halfSize: boolean) {
  const raw = new LibRaw();
  try {
    // libraw-wasm transfers (detaches) the buffer it's given to its worker,
    // so hand it a copy and keep the caller's original bytes reusable.
    await raw.open(bytes.slice(), { ...BASE_SETTINGS, halfSize });
    const [meta, img] = await Promise.all([raw.metadata(), raw.imageData()]);
    if (!img) {
      throw new Error('RAW decode produced no image data (unsupported compression?)');
    }
    return { image: toDecodedImage(img), metadata: toRawMetadata(meta) };
  } finally {
    raw.dispose();
  }
}

/** Fast, downscaled decode for interactive editing. */
export function decodePreview(bytes: Uint8Array<ArrayBuffer>) {
  return decode(bytes, true);
}

/** Full-resolution decode, used only when exporting. */
export function decodeFull(bytes: Uint8Array<ArrayBuffer>) {
  return decode(bytes, false);
}
