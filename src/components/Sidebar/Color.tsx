import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';
import { ControlGroup } from './ControlGroup';
import { JAPANESE_PALETTE } from '../../lib/palette';

interface Props {
  forceOpenSignal?: number;
  forceOpenValue?: boolean;
}

export function Color({ forceOpenSignal, forceOpenValue }: Props) {
  const { params, set } = useEditParams();

  return (
    <Section title="Colour" color={JAPANESE_PALETTE.asagiiro} forceOpenSignal={forceOpenSignal} forceOpenValue={forceOpenValue}>
      <ControlGroup>
        <SliderRow label="Temperature" value={params.temperature} min={-100} max={100} onChange={(v) => set('temperature', v)} />
        <SliderRow label="Tint" value={params.tint} min={-100} max={100} onChange={(v) => set('tint', v)} />
        <SliderRow label="Saturation" value={params.saturation} min={-100} max={100} onChange={(v) => set('saturation', v)} />
        <SliderRow label="Vibrance" value={params.vibrance} min={-100} max={100} onChange={(v) => set('vibrance', v)} />
      </ControlGroup>
    </Section>
  );
}
