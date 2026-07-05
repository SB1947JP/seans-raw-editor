import { DecodedImage } from '../types';

export function computeLumaHistogram(data: Uint8Array, width: number, height: number): Uint32Array {
  const buckets = new Uint32Array(256);
  const pixelCount = width * height;
  const stride = Math.max(1, Math.floor(pixelCount / 50000));
  for (let i = 0; i < pixelCount; i += stride) {
    const o = i * 4;
    const luma = (data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722) | 0;
    buckets[luma]++;
  }
  return buckets;
}

/** Luma histogram computed directly from a decoded RAW's RGB buffer (not canvas readback). */
export function computeImageHistogram(image: DecodedImage): Uint32Array {
  const { data, width, height, bitsPerSample } = image;
  const buckets = new Uint32Array(256);
  const pixelCount = width * height;
  const stride = Math.max(1, Math.floor(pixelCount / 200000));
  const shift = bitsPerSample === 16 ? 8 : 0;
  for (let i = 0; i < pixelCount; i += stride) {
    const o = i * 3;
    const r = data[o] >> shift;
    const g = data[o + 1] >> shift;
    const b = data[o + 2] >> shift;
    const luma = (r * 0.2126 + g * 0.7152 + b * 0.0722) | 0;
    buckets[Math.min(255, luma)]++;
  }
  return buckets;
}
