/**
 * Film-emulation presets for stocks that were on shop shelves around the turn
 * of the millennium.
 *
 * Each preset is a bundle of existing edit parameters, chosen to emulate the
 * stock along four axes:
 *
 *  - `temperature`: the stock's balance point (daylight film = 5500K,
 *    tungsten "Type B" = 3200K) as a mired shift from this editor's D65
 *    neutral — exactly what the Temperature slider speaks (lib/whiteBalance.ts).
 *  - `tint`: the brand's well-known green–magenta cast (Fuji's cooler greens
 *    vs Kodak's warmer golds).
 *  - `saturation`/`vibrance`: the emulsion's colour character — Portra's muted
 *    skin-first palette vs Gold's punchy consumer saturation vs Provia's
 *    crisp neutrality.
 *  - `contrast`: the tone-curve character — slide films (Kodachrome, Provia,
 *    E100) ran steeper curves than colour negative; Portra was engineered
 *    soft for skin.
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
}

export const FILM_STOCKS: FilmStockPreset[] = [
  { label: 'As shot', temperature: 0, tint: 0, saturation: 0, vibrance: 0, contrast: 0 },
  { label: 'Kodachrome 64 · 5500K', temperature: 28, tint: 4, saturation: 8, vibrance: 6, contrast: 15 },
  { label: 'Kodak Gold 200 · 5500K', temperature: 40, tint: 8, saturation: 12, vibrance: 4, contrast: 6 },
  { label: 'Kodak Portra 400 · 5500K', temperature: 30, tint: 3, saturation: -8, vibrance: 6, contrast: -8 },
  { label: 'Fuji Superia 400 · 5500K', temperature: 22, tint: -8, saturation: 10, vibrance: 0, contrast: 8 },
  { label: 'Fuji Provia 100F · 5500K', temperature: 6, tint: -5, saturation: 6, vibrance: 4, contrast: 12 },
  { label: 'Fuji Provia 400X · 5500K', temperature: 12, tint: -7, saturation: 8, vibrance: 2, contrast: 10 },
  { label: 'Ektachrome E100 · 5500K', temperature: 12, tint: 0, saturation: 2, vibrance: 0, contrast: 12 },
  { label: 'Ektachrome 320T in daylight · 3200K', temperature: -100, tint: -6, saturation: -6, vibrance: 0, contrast: 10 },
];

/** The preset matching the current slider values, or undefined (= "Custom"). */
export function matchFilmStock(
  params: Pick<FilmStockPreset, 'temperature' | 'tint' | 'saturation' | 'vibrance' | 'contrast'>,
): FilmStockPreset | undefined {
  return FILM_STOCKS.find(
    (p) =>
      p.temperature === params.temperature &&
      p.tint === params.tint &&
      p.saturation === params.saturation &&
      p.vibrance === params.vibrance &&
      p.contrast === params.contrast,
  );
}
