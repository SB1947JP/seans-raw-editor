import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';

export function Color() {
  const { params, set } = useEditParams();
  return (
    <Section title="Color">
      <SliderRow label="Temperature" value={params.temperature} min={-100} max={100} onChange={(v) => set('temperature', v)} />
      <SliderRow label="Tint" value={params.tint} min={-100} max={100} onChange={(v) => set('tint', v)} />
      <SliderRow label="Saturation" value={params.saturation} min={-100} max={100} onChange={(v) => set('saturation', v)} />
      <SliderRow label="Vibrance" value={params.vibrance} min={-100} max={100} onChange={(v) => set('vibrance', v)} />
    </Section>
  );
}
