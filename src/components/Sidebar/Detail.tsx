import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';
import { JAPANESE_PALETTE } from '../../lib/palette';

export function Detail() {
  const { params, set } = useEditParams();
  return (
    <Section title="Detail" color={JAPANESE_PALETTE.wakatakeiro}>
      <SliderRow label="Sharpen" value={params.sharpen} min={0} max={100} onChange={(v) => set('sharpen', v)} />
      <SliderRow label="Grain" value={params.grain} min={0} max={100} onChange={(v) => set('grain', v)} />
    </Section>
  );
}
