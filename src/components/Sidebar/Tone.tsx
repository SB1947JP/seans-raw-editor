import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';

export function Tone() {
  const { params, set } = useEditParams();
  return (
    <Section title="Tone">
      <SliderRow label="Highlights" value={params.highlights} min={-100} max={100} onChange={(v) => set('highlights', v)} />
      <SliderRow label="Shadows" value={params.shadows} min={-100} max={100} onChange={(v) => set('shadows', v)} />
      <SliderRow label="Whites" value={params.whites} min={-100} max={100} onChange={(v) => set('whites', v)} />
      <SliderRow label="Blacks" value={params.blacks} min={-100} max={100} onChange={(v) => set('blacks', v)} />
    </Section>
  );
}
