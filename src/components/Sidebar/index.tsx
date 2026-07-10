import { useState } from 'react';
import { useEditParams } from '../../state/editParams';
import { DecodedImage, RawMetadata } from '../../types';
import { HistogramData } from '../../lib/histogram';
import { Histogram } from '../Histogram';
import { Basic } from './Basic';
import { Tone } from './Tone';
import { Color } from './Color';
import { Detail } from './Detail';
import { Geometry } from './Geometry';

interface Props {
  metadata: RawMetadata | null;
  histogram: HistogramData | null;
  originalHistogram: HistogramData | null;
  image: DecodedImage;
}

// Aperture comes back as a float32 from LibRaw/EXIF, so a "clean" value like
// f/2.8 is often stored as something like 2.799999952316284 — round to the
// nearest tenth (the finest real f-stop granularity) and drop a trailing
// ".0" so whole stops read as "f/8", not "f/8.0".
function formatFStop(aperture: number): string {
  const rounded = Math.round(aperture * 10) / 10;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
}

export function Sidebar({ metadata, histogram, originalHistogram, image }: Props) {
  const reset = useEditParams((s) => s.reset);
  const undo = useEditParams((s) => s.undo);
  const canUndo = useEditParams((s) => s.history.length > 0);

  // All sections start expanded, so the toggle's own label assumes that's the
  // current state; clicking forces every section to the opposite of `allOpen`
  // via the signal/value pair below (see Section.tsx), then flips both the
  // label and what the *next* click will do.
  const [allOpen, setAllOpen] = useState(true);
  const [toggleSignal, setToggleSignal] = useState(0);
  const handleToggleAll = () => {
    setAllOpen((v) => !v);
    setToggleSignal((s) => s + 1);
  };

  return (
    <div className="w-full sm:w-72 shrink-0 h-[45vh] sm:h-full overflow-y-auto overscroll-contain bg-neutral-900 border-t sm:border-t-0 sm:border-l border-neutral-800 p-3 sm:p-4">
      <div className="mb-4">
        <Histogram before={originalHistogram} after={histogram} />
      </div>
      {metadata && (
        <div className="mb-5 text-xs text-neutral-500">
          <div>{metadata.make} {metadata.model}</div>
          {metadata.iso !== undefined && (
            <div>
              ISO {metadata.iso} · f/{metadata.aperture !== undefined ? formatFStop(metadata.aperture) : '?'} · 1/
              {metadata.shutter ? Math.round(1 / metadata.shutter) : '?'}s
            </div>
          )}
        </div>
      )}
      <button
        onClick={handleToggleAll}
        className="mb-4 w-full text-xs text-neutral-400 border border-neutral-700 rounded py-1.5 hover:bg-neutral-900"
      >
        {allOpen ? 'Hide' : 'Show'} All
      </button>
      <Basic image={image} forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Tone forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Color forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Detail forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Geometry
        imageWidth={image.width}
        imageHeight={image.height}
        forceOpenSignal={toggleSignal}
        forceOpenValue={allOpen}
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="flex-1 text-xs text-neutral-400 border border-neutral-700 rounded py-1.5 hover:bg-neutral-900 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Undo
        </button>
        <button
          onClick={reset}
          className="flex-1 text-xs text-neutral-400 border border-neutral-700 rounded py-1.5 hover:bg-neutral-900"
        >
          Reset all
        </button>
      </div>
    </div>
  );
}
