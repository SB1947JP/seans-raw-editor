import { CurvePoint } from '../types';

/**
 * Monotone cubic (Fritsch–Carlson) interpolation of a set of curve control
 * points, sampled at the given input xs. Monotone specifically so a tone curve
 * never overshoots between nodes — a plain cubic spline can dip below a node
 * and invert local contrast, which reads as haloing/solarisation.
 */
export function sampleCurve(points: CurvePoint[], xs: number[]): number[] {
  const n = points.length;
  const xa = points.map((p) => p.x);
  const ya = points.map((p) => p.y);

  if (n === 1) return xs.map(() => ya[0]);

  const d: number[] = []; // secant slopes
  for (let i = 0; i < n - 1; i++) {
    const dx = xa[i + 1] - xa[i];
    d[i] = dx === 0 ? 0 : (ya[i + 1] - ya[i]) / dx;
  }

  const m: number[] = new Array(n); // tangents
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;

  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * d[i];
        m[i + 1] = t * b * d[i];
      }
    }
  }

  return xs.map((x) => {
    if (x <= xa[0]) return ya[0];
    if (x >= xa[n - 1]) return ya[n - 1];
    let i = 0;
    while (i < n - 1 && x > xa[i + 1]) i++;
    const h = xa[i + 1] - xa[i];
    const t = (x - xa[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ya[i] + h10 * h * m[i] + h01 * ya[i + 1] + h11 * h * m[i + 1];
  });
}

/** 256-entry 8-bit LUT for upload to the shader (input luma → output luma). */
export function buildCurveLut(points: CurvePoint[]): Uint8Array {
  const xs = new Array(256);
  for (let i = 0; i < 256; i++) xs[i] = i / 255;
  const ys = sampleCurve(points, xs);
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.max(0, Math.min(255, Math.round(ys[i] * 255)));
  return lut;
}

/** True for the straight identity line — lets the shader skip the curve stage entirely. */
export function isIdentityCurve(points: CurvePoint[]): boolean {
  return (
    points.length === 2 &&
    points[0].x === 0 &&
    points[0].y === 0 &&
    points[1].x === 1 &&
    points[1].y === 1
  );
}

export interface CurvePreset {
  label: string;
  points: CurvePoint[];
}

/**
 * Curve presets.
 *
 * The two camera looks are shaped after darktable's own base-curve nodes for
 * these makers ("panasonic like" / "leica like" in darktable's basecurve.c,
 * which happen to share the same node set). darktable applies those on
 * scene-linear data as its *primary* display transform; here the curve sits
 * late in an already display-referred pipeline, so applying darktable's linear
 * nodes verbatim would double-brighten. Instead these reproduce the same
 * shape — a gentle toe, a midtone lift and a highlight shoulder — as a
 * contrast curve around the diagonal, giving the camera-JPEG "punch" on top of
 * our faithful neutral render. Tweak from here; that's the point of the tool.
 */
export const CURVE_PRESETS: CurvePreset[] = [
  { label: 'Linear', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
  {
    label: 'Panasonic S5 look',
    points: [
      { x: 0, y: 0 },
      { x: 0.12, y: 0.09 },
      { x: 0.5, y: 0.5 },
      { x: 0.82, y: 0.88 },
      { x: 1, y: 1 },
    ],
  },
  {
    label: 'Leica SL2-S look',
    points: [
      { x: 0, y: 0 },
      { x: 0.14, y: 0.12 },
      { x: 0.5, y: 0.51 },
      { x: 0.84, y: 0.88 },
      { x: 1, y: 1 },
    ],
  },
  {
    label: 'Medium contrast',
    points: [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.2 },
      { x: 0.75, y: 0.8 },
      { x: 1, y: 1 },
    ],
  },
  {
    label: 'Strong contrast',
    points: [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.15 },
      { x: 0.75, y: 0.85 },
      { x: 1, y: 1 },
    ],
  },
];

function samePoints(a: CurvePoint[], b: CurvePoint[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-4 && Math.abs(p.y - b[i].y) < 1e-4);
}

/** The preset matching the current points, or undefined (= "Custom"). */
export function matchCurvePreset(points: CurvePoint[]): CurvePreset | undefined {
  return CURVE_PRESETS.find((p) => samePoints(p.points, points));
}
