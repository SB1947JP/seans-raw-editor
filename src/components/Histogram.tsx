interface Props {
  before: Uint32Array | null;
  after: Uint32Array | null;
}

function Chart({ buckets }: { buckets: Uint32Array | null }) {
  if (!buckets) {
    return <div className="h-16 w-full rounded bg-neutral-950" />;
  }

  const max = Math.max(1, ...buckets);
  const points = Array.from(buckets)
    .map((count, i) => {
      const x = (i / 255) * 100;
      const y = 100 - (count / max) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full rounded bg-neutral-950">
      <polyline points={`0,100 ${points} 100,100`} fill="rgba(228,228,231,0.35)" stroke="none" />
    </svg>
  );
}

export function Histogram({ before, after }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Chart buckets={before} />
        <div className="text-[10px] uppercase tracking-wide text-neutral-600 mt-1 text-center">Before</div>
      </div>
      <div>
        <Chart buckets={after} />
        <div className="text-[10px] uppercase tracking-wide text-neutral-600 mt-1 text-center">After</div>
      </div>
    </div>
  );
}
