import { PointerEvent as ReactPointerEvent, useRef } from 'react';
import { CurvePoint } from '../types';
import { sampleCurve } from '../lib/curve';

interface Props {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  onBeginChange: () => void;
}

const HIT = 0.05; // hit radius in normalised curve space
const MAX_POINTS = 12;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function CurveEditor({ points, onChange, onBeginChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<number | null>(null);

  const toCurveSpace = (clientX: number, clientY: number): CurvePoint => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp(1 - (clientY - rect.top) / rect.height, 0, 1), // y inverted: output 1 at top
    };
  };

  // A single handler on the SVG (pointer-captured there) drives everything, so
  // a drag that starts on a control point still delivers its moves here.
  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    const p = toCurveSpace(e.clientX, e.clientY);

    let idx = points.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < HIT);
    if (idx === -1) {
      if (points.length >= MAX_POINTS) return;
      const next = [...points, p].sort((a, b) => a.x - b.x);
      idx = next.indexOf(p);
      onBeginChange();
      onChange(next);
    } else {
      onBeginChange();
    }
    dragRef.current = idx;
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const idx = dragRef.current;
    if (idx === null) return;
    const p = toCurveSpace(e.clientX, e.clientY);
    const last = points.length - 1;
    const next = points.map((q) => ({ ...q }));
    if (idx === 0) {
      next[0] = { x: 0, y: p.y }; // endpoints slide only along their edge
    } else if (idx === last) {
      next[last] = { x: 1, y: p.y };
    } else {
      const lo = next[idx - 1].x + 0.01; // keep points ordered — can't cross a neighbour
      const hi = next[idx + 1].x - 0.01;
      next[idx] = { x: clamp(p.x, lo, hi), y: p.y };
    }
    onChange(next);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const removePoint = (idx: number) => {
    if (idx === 0 || idx === points.length - 1) return; // endpoints stay
    onBeginChange();
    onChange(points.filter((_, i) => i !== idx));
  };

  // Sampled curve path.
  const N = 64;
  const xs = Array.from({ length: N + 1 }, (_, i) => i / N);
  const ys = sampleCurve(points, xs);
  const path = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'} ${(x * 100).toFixed(2)} ${((1 - clamp(ys[i], 0, 1)) * 100).toFixed(2)}`)
    .join(' ');

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="w-full aspect-square rounded bg-neutral-950 touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {[25, 50, 75].map((v) => (
        <g key={v} stroke="#27272a" strokeWidth={0.5}>
          <line x1={v} y1={0} x2={v} y2={100} />
          <line x1={0} y1={v} x2={100} y2={v} />
        </g>
      ))}
      <line x1={0} y1={100} x2={100} y2={0} stroke="#3f3f46" strokeWidth={0.6} strokeDasharray="2 2" />
      <path d={path} fill="none" stroke="#d4d4d8" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x * 100}
          cy={(1 - p.y) * 100}
          r={2.4}
          fill="#e4e4e7"
          stroke="#18181b"
          strokeWidth={0.8}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'pointer' }}
          onDoubleClick={() => removePoint(i)}
        />
      ))}
    </svg>
  );
}
