import { DecodedImage } from '../types';
import { computeImageHistogram } from './histogram';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export interface AutoLevelsResult {
  exposure: number;
  contrast: number;
}

/**
 * Solves for an exposure + contrast pair that stretches the image's black/white
 * points (a small clipped percentile at each end of the luma histogram) to
 * fill 0..1, mirroring the shader's own `color *= 2^exposure` then
 * `(color - 0.5) * contrastFactor + 0.5` pipeline so the result matches
 * exactly what the sliders would produce.
 */
export function computeAutoLevels(image: DecodedImage): AutoLevelsResult {
  const buckets = computeImageHistogram(image);
  const total = buckets.reduce((sum, n) => sum + n, 0);
  if (total === 0) return { exposure: 0, contrast: 0 };

  const clipCount = total * 0.005; // ignore the darkest/brightest 0.5% as outliers

  let cumulative = 0;
  let blackPoint = 0;
  for (let i = 0; i < 256; i++) {
    cumulative += buckets[i];
    if (cumulative >= clipCount) {
      blackPoint = i;
      break;
    }
  }

  cumulative = 0;
  let whitePoint = 255;
  for (let i = 255; i >= 0; i--) {
    cumulative += buckets[i];
    if (cumulative >= clipCount) {
      whitePoint = i;
      break;
    }
  }

  if (whitePoint <= blackPoint) {
    blackPoint = 0;
    whitePoint = 255;
  }

  const b = blackPoint / 255;
  const w = whitePoint / 255;

  const sum = w + b;
  const exposureFactor = sum > 0.001 ? 1 / sum : 1;
  const exposure = clamp(Math.log2(exposureFactor), -5, 5);

  const clampedFactor = Math.pow(2, exposure);
  const denom = b * clampedFactor - 0.5;
  const contrastFactor = Math.abs(denom) > 1e-4 ? Math.max(0.05, -0.5 / denom) : 1;
  const contrast = clamp(100 * ((Math.atan(contrastFactor) * 4) / Math.PI - 1), -99, 99);

  return { exposure, contrast };
}
