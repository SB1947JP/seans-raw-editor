import { DecodedImage } from '../types';
import { computeImageHistogram } from './histogram';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export interface AutoLevelsResult {
  exposure: number;
  blacks: number;
}

// --- Ported shader tone math -------------------------------------------------
// These mirror adjust.frag.glsl exactly so the solve below targets the real
// pipeline (exposure in LINEAR light, a log-logistic highlight shoulder, and a
// shadow-masked Blacks lift) instead of an outdated model. Keeping them in
// lock-step with the shader is what makes the Auto Levels result land where the
// sliders actually put it.

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function highlightShoulder(m: number, knee: number): number {
  if (m <= knee) return m;
  const excess = m - knee;
  const ceil = 1 - knee;
  return knee + (ceil * excess) / (excess + ceil);
}

/** sRGB value after exposure (+ shoulder), the part shared by both solves. */
function afterExposure(x: number, exposure: number): number {
  let lin = srgbToLinear(Math.max(x, 0)) * Math.pow(2, exposure);
  const exposureAmount = clamp(exposure / 3, 0, 1);
  const knee = 1 + (0.65 - 1) * exposureAmount; // mix(1.0, 0.65, exposureAmount)
  lin = highlightShoulder(lin, knee);
  return linearToSrgb(clamp(lin, 0, 1));
}

/** Full forward tone response for a luma value with exposure + Blacks only. */
function toneForward(x: number, exposure: number, blacks: number): number {
  const s = afterExposure(x, exposure);
  // applyToneRegions Blacks term: shadow-masked lift, added to target luma.
  const blackMask = 1 - smoothstep(0, 0.4, s);
  return clamp(s + (blacks / 100) * blackMask * 0.5, 0, 1);
}

/** Bisection root-find for a monotonic function f over [lo, hi] targeting 0. */
function bisect(f: (v: number) => number, lo: number, hi: number, iters = 40): number {
  let flo = f(lo);
  const fhi = f(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo > 0 === fhi > 0) return Math.abs(flo) < Math.abs(fhi) ? lo : hi; // no sign change → nearer end
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm > 0 === flo > 0) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Auto Levels: stretch the image's black/white points (small clipped
 * percentiles of the luma histogram) to sit near true black and near white,
 * evaluated against the *actual* shader tone pipeline so the sliders land
 * exactly where this predicts.
 *
 * White point is lifted with Exposure (a clean linear-light gain) to just short
 * of clipping (0.95), leaving the highlight shoulder headroom. The black point
 * is seated with the shadow-masked Blacks control rather than Contrast —
 * Contrast pivots at mid-grey, so forcing a shadow to near-zero with it would
 * slam the slider to its extreme and crush the midtones; Blacks targets exactly
 * the shadow region and leaves midtones/highlights intact. The two solves are
 * independent (Blacks barely touches the white end, Exposure sets it), so each
 * is a single 1-D root-find.
 */
export function computeAutoLevels(image: DecodedImage): AutoLevelsResult {
  const buckets = computeImageHistogram(image);
  const total = buckets.reduce((sum, n) => sum + n, 0);
  if (total === 0) return { exposure: 0, blacks: 0 };

  // Asymmetric clip: ignore the darkest 0.5% and brightest 0.1% as outliers
  // (specular glints / hot pixels shouldn't drag the whole white point down).
  const lowClip = total * 0.005;
  const highClip = total * 0.001;

  let cumulative = 0;
  let blackPoint = 0;
  for (let i = 0; i < 256; i++) {
    cumulative += buckets[i];
    if (cumulative >= lowClip) {
      blackPoint = i;
      break;
    }
  }

  cumulative = 0;
  let whitePoint = 255;
  for (let i = 255; i >= 0; i--) {
    cumulative += buckets[i];
    if (cumulative >= highClip) {
      whitePoint = i;
      break;
    }
  }

  if (whitePoint <= blackPoint) return { exposure: 0, blacks: 0 };

  const bp = blackPoint / 255;
  const wp = whitePoint / 255;
  const whiteTarget = 0.95;
  const blackTarget = 0.01;

  // Exposure to seat the white point (linear-light closed form; the shoulder is
  // effectively inert here since the mapped value stays below its knee).
  const exposure = clamp(Math.log2(srgbToLinear(whiteTarget) / srgbToLinear(wp)), -5, 5);

  // Blacks to seat the black point after that exposure. Skip if already deep.
  const bpAfterExposure = afterExposure(bp, exposure);
  let blacks = 0;
  if (bpAfterExposure > blackTarget + 1e-4) {
    blacks = bisect((b) => toneForward(bp, exposure, b) - blackTarget, 0, -100);
  }

  return {
    exposure: Math.round(exposure * 100) / 100,
    blacks: clamp(Math.round(blacks), -100, 0),
  };
}
