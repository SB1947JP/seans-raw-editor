import { useEditParams } from '../../state/editParams';
import { DecodedImage, RawMetadata } from '../../types';
import { HistogramData } from '../../lib/histogram';
import { Histogram } from '../Histogram';
import { Basic } from './Basic';
import { Tone } from './Tone';
import { ToneCurve } from './ToneCurve';
import { Color } from './Color';
import { Grading } from './Grading';
import { Detail } from './Detail';
import { Geometry } from './Geometry';

interface Props {
  metadata: RawMetadata | null;
  histogram: HistogramData | null;
  originalHistogram: HistogramData | null;
  image: DecodedImage;
}

export function Sidebar({ metadata, histogram, originalHistogram, image }: Props) {
  const reset = useEditParams((s) => s.reset);
  const undo = useEditParams((s) => s.undo);
  const canUndo = useEditParams((s) => s.history.length > 0);

  return (
    <div className="w-full sm:w-72 shrink-0 h-[45vh] sm:h-full overflow-y-auto overscroll-contain bg-neutral-900 border-t sm:border-t-0 sm:border-l border-neutral-800 p-3 sm:p-4">
      <div className="mb-4">
        <Histogram before={originalHistogram} after={histogram} />
      </div>
      {metadata && (
        <div className="mb-5 text-xs text-neutral-500">
          <div>{metadata.make} {metadata.model}</div>
          {metadata.iso !== undefined && <div>ISO {metadata.iso} · f/{metadata.aperture} · 1/{metadata.shutter ? Math.round(1 / metadata.shutter) : '?'}s</div>}
        </div>
      )}
      <Basic image={image} />
      <Tone />
      <ToneCurve />
      <Color />
      <Grading />
      <Detail />
      <Geometry imageWidth={image.width} imageHeight={image.height} />
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
