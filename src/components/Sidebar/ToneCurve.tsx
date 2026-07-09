import { useEditParams } from '../../state/editParams';
import { Section } from './Section';
import { JAPANESE_PALETTE } from '../../lib/palette';
import { CurveEditor } from '../CurveEditor';
import { CURVE_PRESETS, matchCurvePreset, isIdentityCurve } from '../../lib/curve';
import { DEFAULT_EDIT_PARAMS } from '../../types';

export function ToneCurve() {
  const { params, set, beginChange } = useEditParams();
  const points = params.lumaCurve;
  const matched = matchCurvePreset(points);

  return (
    <Section title="Tone Curve" color={JAPANESE_PALETTE.edocha} defaultOpen={false}>
      <div className="flex items-center gap-2 mb-2">
        <select
          value={matched ? matched.label : 'custom'}
          onChange={(e) => {
            const preset = CURVE_PRESETS.find((p) => p.label === e.target.value);
            if (!preset) return;
            beginChange();
            set('lumaCurve', preset.points.map((p) => ({ ...p })));
          }}
          title="Camera-look base curves and contrast presets"
          className="flex-1 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-300 py-1 px-2"
        >
          {!matched && (
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
            if (isIdentityCurve(points)) return;
            beginChange();
            set('lumaCurve', DEFAULT_EDIT_PARAMS.lumaCurve.map((p) => ({ ...p })));
          }}
          title="Reset the curve to linear"
          className="text-xs text-neutral-400 border border-neutral-700 rounded px-2 py-1 hover:bg-neutral-900 disabled:opacity-30"
          disabled={isIdentityCurve(points)}
        >
          Reset
        </button>
      </div>
      <CurveEditor
        points={points}
        onBeginChange={beginChange}
        onChange={(next) => set('lumaCurve', next)}
      />
      <p className="mt-1.5 text-[10px] leading-snug text-neutral-600">
        Drag to bend · click to add a point · double-click a point to remove
      </p>
    </Section>
  );
}
