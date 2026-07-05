import { useEditParams } from '../../state/editParams';
import { SliderRow } from '../SliderRow';
import { Section } from './Section';
import { computeAutoLevels } from '../../lib/autoLevels';
import { DecodedImage } from '../../types';

interface Props {
  image: DecodedImage;
}

export function Basic({ image }: Props) {
  const { params, set, beginChange } = useEditParams();

  const handleAutoLevels = () => {
    const { exposure, contrast } = computeAutoLevels(image);
    beginChange();
    set('exposure', Math.round(exposure * 100) / 100);
    set('contrast', Math.round(contrast));
    set('highlights', 0);
    set('shadows', 0);
    set('whites', 0);
    set('blacks', 0);
  };

  return (
    <Section title="Basic">
      <button
        onClick={handleAutoLevels}
        className="mb-3 w-full text-xs text-neutral-300 border border-neutral-700 rounded py-1.5 hover:bg-neutral-800"
      >
        Auto Levels
      </button>
      <SliderRow label="Exposure" value={params.exposure} min={-5} max={5} step={0.05} onChange={(v) => set('exposure', v)} />
      <SliderRow label="Contrast" value={params.contrast} min={-100} max={100} onChange={(v) => set('contrast', v)} />
    </Section>
  );
}
