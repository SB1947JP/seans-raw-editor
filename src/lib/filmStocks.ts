import { CurvePoint } from '../types';

/**
 * Film-emulation presets for stocks that were on shop shelves around the turn
 * of the millennium.
 *
 * Each preset bundles existing edit parameters to emulate the stock along five
 * axes. The single biggest realism lever is the **tone curve** (`curve`): a
 * film's signature is far more its characteristic curve — Portra's soft,
 * lifted-shadow flatness; Kodachrome's deep-shadow punch; Pro 400H's airy
 * pastel toe — than any saturation nudge. So the tonal contrast now lives
 * entirely in each stock's curve (and the separate `contrast` slider is left at
 * 0 to avoid stacking a second contrast on top). The curve is applied to the
 * same `lumaCurve` the Tone Curve editor drives, so after picking a stock you
 * can see and tweak its actual curve.
 *
 * The other axes:
 *  - `temperature`: the stock's balance point (daylight film = 5500K,
 *    tungsten "Type B" = 3200K) as a mired shift from this editor's D65
 *    neutral — exactly what the Temperature slider speaks (lib/whiteBalance.ts).
 *  - `tint`: the brand's well-known green–magenta cast (Fuji's cooler,
 *    green-leaning emulsions vs Kodak's warmer, magenta-golds).
 *  - `saturation`/`vibrance`: the emulsion's colour character — Portra's and
 *    Pro 400H's muted, skin-first pastels (low saturation, positive vibrance to
 *    keep colour pleasant without going punchy) vs Gold's consumer punch vs
 *    Provia's crisp slide-film chroma.
 *
 * The tungsten entry simulates the classic mistake-turned-look of shooting
 * 3200K-balanced slide film (Ektachrome 320T) in daylight — a strong blue,
 * cinematic cast. Its true shift (−159 mired) exceeds the slider's ±100
 * range, so it pins at the slider's maximum cool.
 */
export interface FilmStockPreset {
  label: string;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  contrast: number;
  /** The stock's characteristic tone curve (both axes 0..1), applied to lumaCurve. */
  curve: CurvePoint[];
}

const LINEAR: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

// Slide (reversal) films run steep, contrasty curves with crushed shadows and
// a bright shoulder. Kodachrome is the most extreme — famously inky blacks.
const KODACHROME_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 0.18, y: 0.1 },
  { x: 0.5, y: 0.52 },
  { x: 0.82, y: 0.9 },
  { x: 1, y: 1 },
];
const SLIDE_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 0.2, y: 0.13 },
  { x: 0.5, y: 0.5 },
  { x: 0.8, y: 0.88 },
  { x: 1, y: 1 },
];
const SLIDE_PUNCHY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 0.2, y: 0.12 },
  { x: 0.5, y: 0.51 },
  { x: 0.8, y: 0.89 },
  { x: 1, y: 1 },
];

// Colour negatives have a gentler toe and hold highlights softly — moderate
// contrast, not the steep slide-film S.
const NEG_PUNCHY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 0.16, y: 0.13 },
  { x: 0.5, y: 0.51 },
  { x: 0.84, y: 0.88 },
  { x: 1, y: 1 },
];

// The pro portrait negatives (Portra, Pro 400H, Pro 160NS) are the opposite of
// a slide: low contrast with a lifted black point and a slightly pulled-down
// white point, giving that soft, milky, pastel roll that flatters skin.
const PORTRA_CURVE: CurvePoint[] = [
  { x: 0, y: 0.03 },
  { x: 0.25, y: 0.26 },
  { x: 0.5, y: 0.5 },
  { x: 0.75, y: 0.73 },
  { x: 1, y: 0.97 },
];
const PRO400H_CURVE: CurvePoint[] = [
  { x: 0, y: 0.025 },
  { x: 0.25, y: 0.25 },
  { x: 0.5, y: 0.5 },
  { x: 0.78, y: 0.76 },
  { x: 1, y: 0.975 },
];
// Pro 160NS: the finest, most neutral of the pastel negatives — soft, but a
// touch crisper than the airy 400H (slightly less black lift, firmer highlight).
const PRO160NS_CURVE: CurvePoint[] = [
  { x: 0, y: 0.02 },
  { x: 0.25, y: 0.25 },
  { x: 0.5, y: 0.5 },
  { x: 0.77, y: 0.75 },
  { x: 1, y: 0.98 },
];

export const FILM_STOCKS: FilmStockPreset[] = [
  { label: 'As shot', temperature: 0, tint: 0, saturation: 0, vibrance: 0, contrast: 0, curve: LINEAR },
  { label: 'Kodachrome 64 · 5500K', temperature: 30, tint: 5, saturation: 6, vibrance: 4, contrast: 0, curve: KODACHROME_CURVE },
  { label: 'Kodak Gold 200 · 5500K', temperature: 44, tint: 8, saturation: 14, vibrance: 4, contrast: 0, curve: NEG_PUNCHY_CURVE },
  { label: 'Kodak Portra 400 · 5500K', temperature: 26, tint: 2, saturation: -6, vibrance: 10, contrast: 0, curve: PORTRA_CURVE },
  { label: 'Fuji Superia 400 · 5500K', temperature: 16, tint: -9, saturation: 12, vibrance: 2, contrast: 0, curve: NEG_PUNCHY_CURVE },
  { label: 'Fuji Pro 400H · 5500K', temperature: 12, tint: -7, saturation: -8, vibrance: 8, contrast: 0, curve: PRO400H_CURVE },
  { label: 'Fuji Pro 160NS · 5500K', temperature: 18, tint: -3, saturation: -5, vibrance: 8, contrast: 0, curve: PRO160NS_CURVE },
  { label: 'Fuji Provia 100F · 5500K', temperature: 4, tint: -5, saturation: 6, vibrance: 5, contrast: 0, curve: SLIDE_CURVE },
  { label: 'Fuji Provia 400X · 5500K', temperature: 10, tint: -7, saturation: 9, vibrance: 3, contrast: 0, curve: SLIDE_PUNCHY_CURVE },
  { label: 'Ektachrome E100 · 5500K', temperature: 8, tint: -1, saturation: 3, vibrance: 3, contrast: 0, curve: SLIDE_CURVE },
  { label: 'Ektachrome 320T in daylight · 3200K', temperature: -100, tint: -6, saturation: -4, vibrance: 0, contrast: 0, curve: SLIDE_CURVE },
];

function sameCurve(a: CurvePoint[], b: CurvePoint[] | undefined | null): boolean {
  if (!Array.isArray(b) || a.length !== b.length) return false;
  return a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-4 && Math.abs(p.y - b[i].y) < 1e-4);
}

/** The preset matching the current slider values (including the tone curve), or undefined (= "Custom"). */
export function matchFilmStock(
  params: Pick<FilmStockPreset, 'temperature' | 'tint' | 'saturation' | 'vibrance' | 'contrast'> & {
    lumaCurve: CurvePoint[];
  },
): FilmStockPreset | undefined {
  return FILM_STOCKS.find(
    (p) =>
      p.temperature === params.temperature &&
      p.tint === params.tint &&
      p.saturation === params.saturation &&
      p.vibrance === params.vibrance &&
      p.contrast === params.contrast &&
      sameCurve(p.curve, params.lumaCurve),
  );
}
