import { CropRect } from '../types';

/** Pixel dimensions of the image after crop is applied (crop is a fraction of the upright image). */
export function getEffectiveDimensions(
  image: { width: number; height: number },
  crop: CropRect | null,
): { width: number; height: number } {
  if (!crop) return { width: image.width, height: image.height };
  return {
    width: Math.max(1, Math.round(image.width * crop.width)),
    height: Math.max(1, Math.round(image.height * crop.height)),
  };
}
