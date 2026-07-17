import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';
import { RATIO_PRESETS, RatioPreset, resolveLockedAspect, useCropTool } from '../../state/cropTool';
import { computeAutoCropForRotation, fitAspectInRect, intersectCropRects, isFullFrame } from '../../lib/autoCrop';
import { ControlGroup } from './ControlGroup';
import { JAPANESE_PALETTE } from '../../lib/palette';
import { CropRect } from '../../types';

const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

interface Props {
  imageWidth: number | null;
  imageHeight: number | null;
  forceOpenSignal?: number;
  forceOpenValue?: boolean;
}

/** Reshapes a crop rect to a locked aspect ratio, keeping its center fixed. */
function reshapeToRatio(crop: CropRect, lockedAspect: number, imageWidth: number, imageHeight: number): CropRect {
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  let width = crop.width;
  let height = (imageWidth * width) / lockedAspect / imageHeight;
  if (height > 1) {
    height = 1;
    width = (imageHeight * height * lockedAspect) / imageWidth;
  }
  const x = Math.min(Math.max(centerX - width / 2, 0), 1 - width);
  const y = Math.min(Math.max(centerY - height / 2, 0), 1 - height);
  return { x, y, width, height };
}

export function Geometry({ imageWidth, imageHeight, forceOpenSignal, forceOpenValue }: Props) {
  const { params, set, beginChange } = useEditParams();
  const { ratio, orientation, autoRotationCrop, setRatio, toggleOrientation, setAutoRotationCrop } = useCropTool();
  const crop = params.crop ?? FULL_CROP;
  const cropEnabled = params.crop !== null;
  // Rotation/crop math needs the image's real aspect ratio — without a loaded
  // image there's nothing to preview a crop against, so the controls below
  // are disabled entirely rather than operating on a meaningless placeholder.
  const hasImage = imageWidth !== null && imageHeight !== null;
  const iw = imageWidth ?? 1;
  const ih = imageHeight ?? 1;

  const applyLockedAspect = (lockedAspect: number | null) => {
    if (lockedAspect) {
      beginChange();
      setAutoRotationCrop(false);
      set('crop', reshapeToRatio(crop, lockedAspect, iw, ih));
    }
  };

  const handleRotationChange = (newRotation: number) => {
    set('rotation', newRotation);
    const safeCrop = computeAutoCropForRotation(iw, ih, newRotation);
    const lockedAspect = resolveLockedAspect(ratio, orientation, iw, ih);
    if (autoRotationCrop) {
      // Track the ideal "no smudged corners" rectangle as the angle changes.
      // With a locked ratio, keep that exact aspect and just shrink the largest
      // such rectangle to fit the safe zone — otherwise the crop's ratio would
      // drift with the rotation angle. Free ratio uses the safe rect as-is.
      const target = lockedAspect
        ? fitAspectInRect(safeCrop, lockedAspect, iw, ih)
        : safeCrop;
      set('crop', isFullFrame(target) ? null : target);
    } else if (params.crop) {
      // The user already has a manual crop: shrink it to stay inside the safe
      // zone, but preserve a locked aspect ratio rather than letting the
      // intersection distort it.
      const clipped = intersectCropRects(params.crop, safeCrop);
      set('crop', lockedAspect ? fitAspectInRect(clipped, lockedAspect, iw, ih) : clipped);
    }
  };

  return (
    <Section title="Geometry" color={JAPANESE_PALETTE.fujiiro} forceOpenSignal={forceOpenSignal} forceOpenValue={forceOpenValue}>
      <ControlGroup>
        <SliderRow
          label="Rotation"
          value={params.rotation}
          min={-45}
          max={45}
          step={0.1}
          disabled={!hasImage}
          onChange={handleRotationChange}
        />
      </ControlGroup>
      <label className={`flex items-center gap-2 text-xs text-neutral-400 mb-3 select-none ${hasImage ? '' : 'opacity-40'}`}>
        <input
          type="checkbox"
          checked={cropEnabled}
          disabled={!hasImage}
          onChange={(e) => {
            beginChange();
            setAutoRotationCrop(false);
            set('crop', e.target.checked ? { ...FULL_CROP } : null);
          }}
        />
        Crop
      </label>
      {cropEnabled && (
        <div className="flex items-center gap-2 mb-1">
          <select
            value={String(ratio)}
            onChange={(e) => {
              const value = e.target.value;
              const next: RatioPreset = value === 'free' || value === 'original' ? value : Number(value);
              setRatio(next);
              applyLockedAspect(resolveLockedAspect(next, orientation, iw, ih));
            }}
            className="flex-1 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-300 py-1 px-2"
          >
            {RATIO_PRESETS.map((p) => (
              <option key={p.label} value={String(p.value)}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              toggleOrientation();
              const nextOrientation = orientation === 'landscape' ? 'portrait' : 'landscape';
              applyLockedAspect(resolveLockedAspect(ratio, nextOrientation, iw, ih));
            }}
            disabled={ratio === 'free'}
            title="Swap orientation"
            className="text-xs text-neutral-400 border border-neutral-700 rounded px-2 py-1 hover:bg-neutral-900 disabled:opacity-30"
          >
            ⇄
          </button>
        </div>
      )}
    </Section>
  );
}
