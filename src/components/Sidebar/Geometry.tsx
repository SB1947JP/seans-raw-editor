import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';
import { RATIO_PRESETS, ratioLabel, RatioPreset, resolveLockedAspect, useCropTool } from '../../state/cropTool';
import { computeAutoCropForRotation, fitAspectInRect, intersectCropRects, isFullFrame } from '../../lib/autoCrop';
import { ControlGroup } from './ControlGroup';
import { UI_COLORS } from '../../lib/palette';
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
  const { ratio, orientation, autoRotationCrop, setRatio, setOrientation, setAutoRotationCrop } = useCropTool();
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
    <Section title="Geometry" defaultOpen={false} forceOpenSignal={forceOpenSignal} forceOpenValue={forceOpenValue}>
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
                {ratioLabel(p, orientation)}
              </option>
            ))}
          </select>
        </div>
      )}
      {cropEnabled && (
        // A labelled pair rather than the old bare "swap" glyph: portrait crops
        // were always supported, but a single unlabelled swap button gave no
        // hint they existed. Square and Free have no orientation to pick, so
        // the control is disabled there rather than silently doing nothing.
        <div role="group" aria-label="Crop orientation" className="flex gap-1 mb-1">
          {([
            { id: 'landscape', label: 'Landscape', w: 13, h: 9 },
            { id: 'portrait', label: 'Portrait', w: 9, h: 13 },
          ] as const).map((o) => {
            const active = orientation === o.id;
            const disabled = ratio === 'free' || ratio === 1;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => {
                  if (orientation === o.id) return;
                  setOrientation(o.id);
                  applyLockedAspect(resolveLockedAspect(ratio, o.id, iw, ih));
                }}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs border rounded py-1 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  borderColor: active && !disabled ? UI_COLORS.accent : '#3f3f46',
                  color: active && !disabled ? UI_COLORS.accent : '#a1a1aa',
                  backgroundColor: active && !disabled ? 'rgba(96,139,149,0.15)' : 'transparent',
                }}
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden="true">
                  <rect
                    x={(16 - o.w) / 2}
                    y={(16 - o.h) / 2}
                    width={o.w}
                    height={o.h}
                    rx="1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                </svg>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}
