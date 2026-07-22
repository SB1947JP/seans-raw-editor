import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 'free' = no lock, 'original' = source image's own aspect, number = a landscape-form (>=1) width/height ratio. */
export type RatioPreset = 'free' | 'original' | number;
export type Orientation = 'landscape' | 'portrait';

export const RATIO_PRESETS: { label: string; value: RatioPreset }[] = [
  { label: 'Free', value: 'free' },
  { label: 'Original', value: 'original' },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
  { label: '5:4', value: 5 / 4 },
];

/**
 * How a preset should read in the dropdown for the current orientation — "4:3"
 * in landscape, "3:4" in portrait.
 *
 * The stored preset stays in its canonical landscape (>=1) form no matter which
 * orientation is active, which is what keeps the dropdown selection stable when
 * the user flips orientation. But showing the landscape label while a portrait
 * crop is active gave no clue that portrait was even possible, so the *label*
 * follows the orientation even though the value doesn't. Square and the
 * non-numeric presets are orientation-agnostic and pass through unchanged.
 */
export function ratioLabel(preset: { label: string; value: RatioPreset }, orientation: Orientation): string {
  if (typeof preset.value !== 'number' || orientation === 'landscape') return preset.label;
  const [w, h] = preset.label.split(':');
  return w && h && w !== h ? `${h}:${w}` : preset.label;
}

interface CropToolStore {
  ratio: RatioPreset;
  orientation: Orientation;
  // True until the user manually touches the crop (drags a handle, toggles
  // the checkbox, or picks a ratio) — while true, changing Rotation keeps the
  // crop tracking the ideal "no smudged corners" rectangle automatically.
  // Once false, rotation changes only ever shrink the user's own crop to
  // stay inside that safe rectangle, never override it.
  autoRotationCrop: boolean;
  setRatio: (r: RatioPreset) => void;
  setOrientation: (o: Orientation) => void;
  toggleOrientation: () => void;
  setAutoRotationCrop: (v: boolean) => void;
  resetForNewImage: () => void;
}

export const useCropTool = create<CropToolStore>()(
  persist(
    (set) => ({
      ratio: 'original',
      orientation: 'landscape',
      autoRotationCrop: true,
      setRatio: (r) => set({ ratio: r }),
      setOrientation: (orientation) => set({ orientation }),
      toggleOrientation: () => set((s) => ({ orientation: s.orientation === 'landscape' ? 'portrait' : 'landscape' })),
      setAutoRotationCrop: (v) => set({ autoRotationCrop: v }),
      resetForNewImage: () => set({ autoRotationCrop: true, ratio: 'original' }),
    }),
    { name: 'lumix-crop-tool' },
  ),
);

/**
 * Resolves a ratio preset + orientation to a concrete width/height pixel
 * ratio, or null when unlocked. The preset itself always stays in its
 * canonical (landscape, >=1) form — only `orientation` flips it — so the
 * dropdown selection never changes when the user hits the swap button.
 */
export function resolveLockedAspect(
  ratio: RatioPreset,
  orientation: Orientation,
  imageWidth: number,
  imageHeight: number,
): number | null {
  if (ratio === 'free') return null;
  const base = ratio === 'original' ? Math.max(imageWidth, imageHeight) / Math.min(imageWidth, imageHeight) : ratio;
  return orientation === 'landscape' ? base : 1 / base;
}
