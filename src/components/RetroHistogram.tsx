import { HistogramData } from '../lib/histogram';

/**
 * The histogram drawn the way a 1984 Macintosh would have drawn it.
 *
 * The original 512×342 screen was strictly 1-bit: pure black on white, no
 * greys and no antialiasing. Shading was faked with ordered dither patterns,
 * and chart series were told apart by *pattern* rather than colour, because
 * colour did not exist. This follows those rules literally:
 *
 *  - everything is #000 on #fff, with shapeRendering="crispEdges" so the
 *    browser can't smooth the pixel steps away;
 *  - the channel envelope is filled with a 50% checkerboard built from real blocks
 *    rather than a CSS pattern, so it stays a visible lattice of squares
 *    instead of blurring into flat grey at small sizes;
 *  - R/G/B stay distinguishable as solid/dashed/dotted staircases — the
 *    period-correct way to plot three series without colour.
 *
 * The data is quantised onto a coarse grid first, which is what produces the
 * chunky stepped silhouette. A smooth curve would look like a modern chart
 * rendered in black, which is not the same thing at all.
 */

const COLS = 48;
const ROWS = 16;
const CELL_W = 100 / COLS;
const CELL_H = 100 / ROWS;

/** Bucket the 256-bin histogram down to COLS columns, as a 0..ROWS height. */
function quantise(buckets: Uint32Array, max: number): number[] {
  const out: number[] = [];
  const per = Math.ceil(buckets.length / COLS);
  for (let c = 0; c < COLS; c++) {
    let peak = 0;
    for (let i = c * per; i < Math.min((c + 1) * per, buckets.length); i++) {
      if (buckets[i] > peak) peak = buckets[i];
    }
    out.push(Math.round((peak / max) * ROWS));
  }
  return out;
}

/** Staircase along the tops of the quantised columns, in viewBox coords. */
function staircase(heights: number[]): string {
  const pts: string[] = [];
  heights.forEach((h, c) => {
    const y = 100 - h * CELL_H;
    pts.push(`${c * CELL_W},${y}`, `${(c + 1) * CELL_W},${y}`);
  });
  return pts.join(' ');
}

export function RetroHistogram({ data, ticks }: { data: HistogramData; ticks: number[] }) {
  const max = Math.max(1, ...data.r, ...data.g, ...data.b);
  // Fill against the per-bucket envelope of R/G/B, not luma. Everything here is
  // normalised to the brightest *channel*, and luma sits well under that —
  // filling from it quantised to ROWS rounds most of the chart to zero and
  // leaves a nearly empty box. The envelope traces the same silhouette the
  // colour histogram shows, which is what the dither should be shading in.
  const envelope = new Uint32Array(data.r.length);
  for (let i = 0; i < envelope.length; i++) {
    envelope[i] = Math.max(data.r[i], data.g[i], data.b[i]);
  }
  const filled = quantise(envelope, max);

  // 50% ordered dither: fill every other cell in a checkerboard. Drawn as real
  // rects rather than an SVG <pattern> because the chart is stretched to fit
  // the panel, and a pattern would be resampled into mush at this size.
  const blocks: { x: number; y: number }[] = [];
  filled.forEach((h, c) => {
    for (let r = 0; r < h; r++) {
      if ((c + r) % 2 === 0) blocks.push({ x: c * CELL_W, y: 100 - (r + 1) * CELL_H });
    }
  });

  const series = [
    { key: 'r', dash: undefined },
    { key: 'g', dash: '3 2' },
    { key: 'b', dash: '1 2' },
  ] as const;

  return (
    <div className="w-full border-2 border-black bg-white" style={{ imageRendering: 'pixelated' }}>
      {/* Classic Mac title bar: six hairlines with the title knocked out of
          the middle, and a close box at the left. */}
      <div className="relative flex items-center border-b-2 border-black bg-white px-1 h-4 overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 bottom-0"
          style={{
            backgroundImage: 'repeating-linear-gradient(to bottom, #000 0 1px, #fff 1px 3px)',
          }}
        />
        <div className="relative z-10 w-2.5 h-2.5 border-2 border-black bg-white" />
        <div className="relative z-10 mx-auto bg-white px-1 text-[9px] font-bold uppercase tracking-widest text-black leading-none">
          Histogram
        </div>
        {/* Balances the close box so the title sits optically centred. */}
        <div className="relative z-10 w-2.5 h-2.5" />
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="block h-20 sm:h-32 w-full"
      >
        {ticks.slice(1, -1).map((t) => (
          <line
            key={t}
            x1={(t / 255) * 100}
            y1={0}
            x2={(t / 255) * 100}
            y2={100}
            stroke="#000"
            strokeWidth={0.5}
            strokeDasharray="2 3"
          />
        ))}

        {blocks.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={CELL_W} height={CELL_H} fill="#000" />
        ))}

        {series.map(({ key, dash }) => (
          <polyline
            key={key}
            points={staircase(quantise(data[key], max))}
            fill="none"
            stroke="#000"
            strokeWidth={1.2}
            strokeDasharray={dash}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Pattern key — how a chart of this era told its series apart. */}
      <div className="flex items-center justify-center gap-2 border-t-2 border-black px-1 py-0.5 text-[8px] font-bold uppercase text-black">
        {[
          { label: 'R', dash: undefined },
          { label: 'G', dash: '3 2' },
          { label: 'B', dash: '1 2' },
        ].map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <svg width="14" height="4" shapeRendering="crispEdges" aria-hidden="true">
              <line x1="0" y1="2" x2="14" y2="2" stroke="#000" strokeWidth="2" strokeDasharray={s.dash} />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
