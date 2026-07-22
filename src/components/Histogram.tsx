import { useState } from 'react';
import { UI_COLORS } from '../lib/palette';
import { HistogramData } from '../lib/histogram';
import { useUiMode } from '../state/uiMode';
import { RetroHistogram } from './RetroHistogram';

interface Props {
  before: HistogramData | null;
  after: HistogramData | null;
}

type Mode = 'before' | 'after';

// Only the live "after" view is accented; "before" is a reference state, so
// it reads as neutral rather than as a second competing colour.
const TAB_COLORS: Record<Mode, string> = {
  before: UI_COLORS.heading,
  after: UI_COLORS.accent,
};

const CHANNELS = [
  { key: 'r', color: '#ef4444' },
  { key: 'g', color: '#22c55e' },
  { key: 'b', color: '#3b82f6' },
] as const;

function toPoints(buckets: Uint32Array, max: number): string {
  return Array.from(buckets)
    .map((count, i) => `${(i / 255) * 100},${100 - (count / max) * 100}`)
    .join(' ');
}

export function Histogram({ before, after }: Props) {
  const [mode, setMode] = useState<Mode>('after');
  // Purely a display preference, not an edit — session-local rather than
  // persisted (see Basic.tsx's showAutoAndCurve for why: growing EditParams's
  // schema is what caused the blank-page restore bug).
  const [visible, setVisible] = useState(true);
  // Read-only here — the toggle itself lives in the header, beside the other
  // whole-app actions, since it reskins far more than the histogram.
  const retro = useUiMode((s) => s.retro);
  const data = mode === 'before' ? before : after;

  // One shared max across R/G/B so the channels are comparable — this is what
  // makes per-channel clipping visible as a spike hitting an edge.
  const max = data ? Math.max(1, ...data.r, ...data.g, ...data.b) : 1;

  // Quarter-tone gridlines/labels give the 0–255 chart a readable scale
  // (shadows → highlights) so bucket positions can be judged, not just shape.
  const TICKS = [0, 64, 128, 192, 255];

  return (
    <div>
      {/* No heading and no noun on the button: the chart sits directly beneath
          and is unmistakable, so naming it twice in one narrow row just cost
          space at the panel's minimum width. */}
      <div className="flex items-center justify-end mb-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVisible((v) => !v)}
            aria-label={`${visible ? 'Hide' : 'Show'} histogram`}
            className="text-[10px] uppercase tracking-wide whitespace-nowrap text-neutral-500 hover:text-neutral-300"
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {visible && (
        <>
          {data && retro ? (
            <RetroHistogram data={data} ticks={TICKS} />
          ) : data ? (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 sm:h-32 w-full rounded bg-neutral-950">
              {TICKS.slice(1, -1).map((t) => (
                <line
                  key={t}
                  x1={(t / 255) * 100}
                  y1={0}
                  x2={(t / 255) * 100}
                  y2={100}
                  stroke="#3f3f46"
                  strokeWidth={0.4}
                />
              ))}
              <polyline
                points={`0,100 ${toPoints(data.luma, max)} 100,100`}
                fill="#a3a3a3"
                fillOpacity={0.12}
                stroke="none"
              />
              {CHANNELS.map(({ key, color }) => (
                <polyline
                  key={key}
                  points={`0,100 ${toPoints(data[key], max)} 100,100`}
                  fill={color}
                  fillOpacity={0.35}
                  stroke={color}
                  strokeOpacity={0.9}
                  strokeWidth={0.9}
                  style={{ mixBlendMode: 'screen' }}
                />
              ))}
            </svg>
          ) : (
            <div className="h-20 sm:h-32 w-full rounded bg-neutral-950" />
          )}
          <div
            className={`flex justify-between mt-0.5 px-0.5 text-[9px] tabular-nums ${
              retro ? 'font-bold text-neutral-300' : 'text-neutral-600'
            }`}
          >
            {TICKS.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <div className="flex mt-1 gap-1">
            {(['before', 'after'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="flex-1 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium"
                style={{
                  color: mode === m ? TAB_COLORS[m] : '#71717a',
                  backgroundColor: mode === m ? `${TAB_COLORS[m]}22` : 'transparent',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
