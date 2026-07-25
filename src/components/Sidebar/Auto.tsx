import { useEffect, useState } from 'react';
import { useEditParams } from '../../state/editParams';
import { Section } from './Section';
import { detectDustSpots } from '../../lib/dustSpots';
import { ACCENT_BORDER, UI_COLORS } from '../../lib/palette';
import { DecodedImage } from '../../types';

interface Props {
  image: DecodedImage | null;
  forceOpenSignal?: number;
  forceOpenValue?: boolean;
}

/**
 * The one-click corrections. They live in their own section, above the manual
 * controls, because they are a different kind of thing: they *inspect the
 * photograph* and write a result into the sliders below, rather than being a
 * value you dial in yourself.
 *
 * Auto Levels used to live here too. It was removed deliberately: it worked by
 * keeping a hand-ported copy of the shader's tone maths in JS so it could
 * predict where the sliders should land, which meant every change to the tone
 * pipeline had to be mirrored in a second place or the button silently started
 * giving bad results (it did drift once, and solved Contrast to 95). That tax
 * fell on exactly the colour/tone work this project cares most about, so the
 * duplicate maths is gone. See CHANGELOG; it's recoverable from git history.
 */
export function Auto({ image, forceOpenSignal, forceOpenValue }: Props) {
  const { params, set, beginChange } = useEditParams();
  const dustCount = params.dustSpots.length;
  // 'scanning' paints the label before the (synchronous, ~50ms) scan starts;
  // 'none' reports a clean sensor, which would otherwise look like a dead
  // button. Neither belongs in EditParams — they describe the last click, not
  // the photograph.
  const [dustState, setDustState] = useState<'idle' | 'scanning' | 'none'>('idle');

  // A different photo has different dust, so the "nothing found" note must not
  // outlive the image it was about.
  useEffect(() => setDustState('idle'), [image]);

  const handleDustRemoval = () => {
    if (!image) return;
    if (dustCount > 0) {
      beginChange();
      set('dustSpots', []);
      setDustState('idle');
      return;
    }
    setDustState('scanning');
    // Yield one frame so "Scanning…" actually appears; the detector walks the
    // whole preview and would otherwise block the paint it depends on.
    requestAnimationFrame(() => {
      const spots = detectDustSpots(image);
      if (spots.length === 0) {
        setDustState('none');
        return;
      }
      beginChange();
      set('dustSpots', spots);
      setDustState('idle');
    });
  };

  return (
    <Section title="Auto" forceOpenSignal={forceOpenSignal} forceOpenValue={forceOpenValue}>
      {/* One click: find the spots and heal them. Clicking again removes the
          healing entirely — the spot list is an ordinary edit parameter, so it
          also undoes, persists and exports with everything else, and the RAW
          file itself is never touched. */}
      <button
        onClick={handleDustRemoval}
        disabled={!image || dustState === 'scanning'}
        title={
          image
            ? dustCount > 0
              ? 'Stop healing these spots and show the original pixels'
              : 'Find sensor dust in smooth, bright areas and fill each spot from the pixels around it'
            : 'Open a RAW file to use Dust Removal'
        }
        className="w-full text-xs border rounded py-1.5 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
        style={
          dustCount > 0
            ? { borderColor: ACCENT_BORDER, color: UI_COLORS.accent }
            : { borderColor: '#404040', color: '#d4d4d8' }
        }
      >
        {dustState === 'scanning'
          ? 'Scanning…'
          : dustCount > 0
            ? `Dust Removed (${dustCount}) — Undo`
            : 'Dust Removal'}
      </button>
      {dustState === 'none' && <div className="mt-1 text-[10px] text-neutral-500">No dust spots found.</div>}
    </Section>
  );
}
