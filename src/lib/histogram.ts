import { DecodedImage } from '../types';

/** Per-channel + luma histograms, 256 buckets each. */
export interface HistogramData {
  luma: Uint32Array;
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
}

/** RGB + luma histograms from RGBA canvas readback (gl.readPixels output). */
export function computeRgbHistogram(data: Uint8Array, width: number, height: number): HistogramData {
  const luma = new Uint32Array(256);
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const pixelCount = width * height;
  const stride = Math.max(1, Math.floor(pixelCount / 50000));
  for (let i = 0; i < pixelCount; i += stride) {
    const o = i * 4;
    const cr = data[o];
    const cg = data[o + 1];
    const cb = data[o + 2];
    r[cr]++;
    g[cg]++;
    b[cb]++;
    luma[(cr * 0.2126 + cg * 0.7152 + cb * 0.0722) | 0]++;
  }
  return { luma, r, g, b };
}

/** RGB + luma histograms straight from a decoded RAW's RGB buffer. */
export function computeImageRgbHistogram(image: DecodedImage): HistogramData {
  const { data, width, height, bitsPerSample } = image;
  const luma = new Uint32Array(256);
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const pixelCount = width * height;
  const stride = Math.max(1, Math.floor(pixelCount / 200000));
  const shift = bitsPerSample === 16 ? 8 : 0;
  for (let i = 0; i < pixelCount; i += stride) {
    const o = i * 3;
    const cr = data[o] >> shift;
    const cg = data[o + 1] >> shift;
    const cb = data[o + 2] >> shift;
    r[cr]++;
    g[cg]++;
    b[cb]++;
    luma[Math.min(255, (cr * 0.2126 + cg * 0.7152 + cb * 0.0722) | 0)]++;
  }
  return { luma, r, g, b };
}

