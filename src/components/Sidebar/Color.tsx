import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';
import { JAPANESE_PALETTE } from '../../lib/palette';
import { FILM_STOCKS, matchFilmStock } from '../../lib/filmStocks';

export function Color() {
  const { params, set, beginChange } = useEditParams();

  // Derive the selection from the sliders themselves: if the user drags any
  // of the emulated parameters away from a preset, the dropdown falls back to
  // "Custom" instead of claiming a stock it no longer matches.
  const matched = matchFilmStock(params);

  return (
    <Section title="Colour" color={JAPANESE_PALETTE.asagiiro}>
      <SliderRow label="Temperature" value={params.temperature} min={-100} max={100} onChange={(v) => set('temperature', v)} />
      <div className="mb-3 -mt-1">
        <div className="text-xs text-neutral-400 mb-1">Film emulation</div>
        <select
          value={matched ? matched.label : 'custom'}
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
          {!matched && (
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
      <SliderRow label="Tint" value={params.tint} min={-100} max={100} onChange={(v) => set('tint', v)} />
      <SliderRow label="Saturation" value={params.saturation} min={-100} max={100} onChange={(v) => set('saturation', v)} />
      <SliderRow label="Vibrance" value={params.vibrance} min={-100} max={100} onChange={(v) => set('vibrance', v)} />
    </Section>
  );
}
