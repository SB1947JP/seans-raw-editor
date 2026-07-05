import { CropRect } from '../types';

export const MIN_CROP_FRACTION = 0.05;

export type CropHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function moveCrop(start: CropRect, dxFrac: number, dyFrac: number): CropRect {
  return {
    ...start,
    x: clamp(start.x + dxFrac, 0, 1 - start.width),
    y: clamp(start.y + dyFrac, 0, 1 - start.height),
  };
}

/**
 * Resizes a crop rect by dragging one handle, keeping the opposite corner/edge
 * fixed. When `lockedAspect` (width/height, in real image pixels) is set, the
 * dragged dimension drives the other one to preserve that ratio.
 */
export function resizeCrop(
  handle: CropHandle,
  start: CropRect,
  dxFrac: number,
  dyFrac: number,
  lockedAspect: number | null,
  imageWidth: number,
  imageHeight: number,
): CropRect {
  const movesX = handle.includes('w') || handle.includes('e');
  const movesY = handle.includes('n') || handle.includes('s');
  const anchorX = handle.includes('w') ? start.x + start.width : start.x;
  const anchorY = handle.includes('n') ? start.y + start.height : start.y;

  let width = start.width;
  let height = start.height;

  if (movesX) {
    const rawEdge = handle.includes('w') ? start.x + dxFrac : start.x + start.width + dxFrac;
    width = Math.abs(rawEdge - anchorX);
  }
  if (movesY) {
    const rawEdge = handle.includes('n') ? start.y + dyFrac : start.y + start.height + dyFrac;
    height = Math.abs(rawEdge - anchorY);
  }

  if (lockedAspect) {
    if (movesX) {
      height = (imageWidth * width) / lockedAspect / imageHeight;
    } else if (movesY) {
      width = (imageHeight * height * lockedAspect) / imageWidth;
    }
  }

  // How far the box can extend from the fixed anchor without leaving [0,1].
  const maxWidthFromAnchor = handle.includes('w') ? anchorX : 1 - anchorX;
  const maxHeightFromAnchor = handle.includes('n') ? anchorY : 1 - anchorY;

  if (lockedAspect) {
    // Shrink both dimensions together so the ratio survives hitting an edge,
    // instead of clamping one axis independently and distorting the ratio.
    const scale = Math.min(
      width > maxWidthFromAnchor ? maxWidthFromAnchor / width : 1,
      height > maxHeightFromAnchor ? maxHeightFromAnchor / height : 1,
      1,
    );
    width *= scale;
    height *= scale;
  } else {
    width = Math.min(width, maxWidthFromAnchor);
    height = Math.min(height, maxHeightFromAnchor);
  }

  width = clamp(width, MIN_CROP_FRACTION, 1);
  height = clamp(height, MIN_CROP_FRACTION, 1);

  const x = handle.includes('w') ? anchorX - width : anchorX;
  const y = handle.includes('n') ? anchorY - height : anchorY;

  return { x, y, width, height };
}
