import { useState } from 'react';
import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';
import { computeAutoLevels } from '../../lib/autoLevels';
import { JAPANESE_PALETTE } from '../../lib/palette';
import { FILM_STOCKS, matchFilmStock } from '../../lib/filmStocks';
import { CurveEditor } from '../CurveEditor';
import { CURVE_PRESETS, matchCurvePreset, isIdentityCurve, normalizeCurve } from '../../lib/curve';
import { DecodedImage, DEFAULT_EDIT_PARAMS } from '../../types';

interface Props {
  image: DecodedImage;
}

export function Basic({ image }: Props) {
  const { params, set, beginChange } = useEditParams();
  // Purely a display preference (decluttering, not an edit) — session-local
  // rather than persisted, so it doesn't grow EditParams's schema (that
  // exact kind of growth is what caused the blank-page restore bug fixed
  // earlier: an older persisted session missing a newer field).
  const [showAutoAndCurve, setShowAutoAndCurve] = useState(true);

  // Derive the selection from the sliders themselves: if the user drags any
  // of the emulated parameters away from a preset, the dropdown falls back to
  // "Custom" instead of claiming a stock it no longer matches.
  const matchedFilmStock = matchFilmStock(params);

  // Normalized so CurveEditor (which does plain array operations, not the
  // guarded helpers in lib/curve.ts) never receives a missing/malformed value.
  const curvePoints = normalizeCurve(params.lumaCurve);
  const matchedCurve = matchCurvePreset(curvePoints);

  const handleAutoLevels = () => {
    const { exposure, blacks } = computeAutoLevels(image);
    beginChange();
    set('exposure', exposure);
    set('blacks', blacks);
    set('contrast', 0);
    set('highlights', 0);
    set('shadows', 0);
    set('whites', 0);
    set('brightness', 0);
  };

  return (
    <Section title="Basic" color={JAPANESE_PALETTE.shuiro}>
      <div className="mb-3">
        <div className="text-xs text-neutral-400 mb-1">Tone Mapper</div>
        <select
          value={params.tonemapMode}
          onChange={(e) => {
            beginChange();
            set('tonemapMode', e.target.value as typeof params.tonemapMode);
          }}
          title="How highlights roll off to white. AgX (Blender's filmic view transform) desaturates extreme highlights gracefully toward white instead of clipping to a harsh colour."
          className="w-full bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-300 py-1 px-2"
        >
          <option value="classic">Classic</option>
          <option value="agx">AgX (filmic)</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs text-neutral-400 mb-3 select-none">
        <input
          type="checkbox"
          checked={showAutoAndCurve}
          onChange={(e) => setShowAutoAndCurve(e.target.checked)}
        />
        {showAutoAndCurve ? 'Hide' : 'Show'} Auto Levels &amp; Curves
      </label>

      {showAutoAndCurve && (
        <>
          <div className="mb-3">
            <div className="text-xs text-neutral-400 mb-1">Tone Curve</div>
            <div className="flex items-center gap-2 mb-2">
              <select
                value={matchedCurve ? matchedCurve.label : 'custom'}
                onChange={(e) => {
                  const preset = CURVE_PRESETS.find((p) => p.label === e.target.value);
                  if (!preset) return;
                  beginChange();
                  set('lumaCurve', preset.points.map((p) => ({ ...p })));
                }}
                title="Camera-look base curves and contrast presets"
                className="flex-1 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-300 py-1 px-2"
              >
                {!matchedCurve && (
                  <option value="custom" disabled>
                    Custom
                  </option>
                )}
                {CURVE_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (isIdentityCurve(curvePoints)) return;
                  beginChange();
                  set('lumaCurve', DEFAULT_EDIT_PARAMS.lumaCurve.map((p) => ({ ...p })));
                }}
                title="Reset the curve to linear"
                className="text-xs text-neutral-400 border border-neutral-700 rounded px-2 py-1 hover:bg-neutral-900 disabled:opacity-30"
                disabled={isIdentityCurve(curvePoints)}
              >
                Reset
              </button>
            </div>
            <CurveEditor
              points={curvePoints}
              onBeginChange={beginChange}
              onChange={(next) => set('lumaCurve', next)}
            />
            <p className="mt-1.5 text-[10px] leading-snug text-neutral-600">
              Drag to bend · click to add a point · double-click a point to remove
            </p>
          </div>

          <button
            onClick={handleAutoLevels}
            className="mb-3 w-full text-xs text-neutral-300 border border-neutral-700 rounded py-1.5 hover:bg-neutral-800"
          >
            Auto Levels
          </button>
        </>
      )}

      <div className="mb-3">
        <div className="text-xs text-neutral-400 mb-1">Film emulation</div>
        <select
          value={matchedFilmStock ? matchedFilmStock.label : 'custom'}
          onChange={(e) => {
            const preset = FILM_STOCKS.find((p) => p.label === e.target.value);
            if (!preset) return;
            beginChange();
            set('temperature', preset.temperature);
            set('tint', preset.tint);
            set('saturation', preset.saturation);
            set('vibrance', preset.vibrance);
            set('contrast', preset.contrast);
          }}
          title="Emulate the colour balance and tone curve of late-90s film stocks"
          className="w-full bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-300 py-1 px-2"
        >
          {!matchedFilmStock && (
            <option value="custom" disabled>
              Custom
            </option>
          )}
          {FILM_STOCKS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <SliderRow label="Exposure" value={params.exposure} min={-5} max={5} step={0.05} onChange={(v) => set('exposure', v)} />
      <SliderRow label="Brightness" value={params.brightness} min={-100} max={100} onChange={(v) => set('brightness', v)} />
      <SliderRow label="Contrast" value={params.contrast} min={-100} max={100} onChange={(v) => set('contrast', v)} />
    </Section>
  );
}
