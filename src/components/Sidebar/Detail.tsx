import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';

export function Detail() {
  const { params, set } = useEditParams();
  return (
    <Section title="Detail">
      <SliderRow label="Sharpen" value={params.sharpen} min={0} max={100} onChange={(v) => set('sharpen', v)} />
    </Section>
  );
}
