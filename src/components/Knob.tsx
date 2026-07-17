import { PointerEvent as ReactPointerEvent, useRef } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  disabled?: boolean;
  /** Bipolar dials fill their ring outward from the 12-o'clock centre; unipolar
   *  ones fill from the minimum. Drives only the lit-tick appearance. */
  bipolar: boolean;
  onBeginChange: () => void;
  onChange: (value: number) => void;
  onReset: () => void;
}

// A 270° sweep with the dead zone at the bottom: minimum sits at 7:30, maximum
// at 4:30, turning clockwise over the top — the standard hardware-knob layout.
const START_DEG = 225;
const SWEEP_DEG = 270;
const CENTER = 22;
const TICKS = 13;
const ACCENT = '#7cb3c0'; // brightened asagiiro — the "lit" indicator colour
const DIM = '#3f3f46';

/** Point on the knob face for a given clockwise-from-top angle (deg). */
function polar(angleDeg: number, radius: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [CENTER + radius * Math.sin(a), CENTER - radius * Math.cos(a)];
}

export function Knob({ value, min, max, step, defaultValue, disabled = false, bipolar, onBeginChange, onChange, onReset }: Props) {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
  const lastDownRef = useRef(0);
  const decimals = (String(step).split('.')[1] || '').length;

  const t = (value - min) / (max - min); // 0..1 position of the current value
  const angle = START_DEG + t * SWEEP_DEG;
  const [ix, iy] = polar(angle, 13); // indicator tip

  // Which fraction of the ring counts as "lit": a bipolar dial lights from the
  // centre out toward the current value; a unipolar one lights from the start.
  const centreT = bipolar ? (defaultValue - min) / (max - min) : 0;

  const commit = (raw: number) => {
    const snapped = Math.round(raw / step) * step;
    const clamped = Math.min(max, Math.max(min, parseFloat(snapped.toFixed(decimals))));
    if (clamped !== value) onChange(clamped);
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    // Touch/pen have no native dblclick, so detect a double-tap here to reset.
    // Mouse resets go through the native onDoubleClick below instead — mixing a
    // manual pointerdown-timing check with setPointerCapture (which we need so a
    // drag can leave the small knob) was swallowing the second click on mouse.
    if (e.pointerType !== 'mouse') {
      const now = Date.now();
      if (now - lastDownRef.current < 300) {
        lastDownRef.current = now;
        dragRef.current = null;
        onReset();
        return;
      }
      lastDownRef.current = now;
    }
    // Capture so the drag keeps tracking even once the pointer leaves the 44px
    // knob. Safe for mouse here (unlike the native range slider) because we only
    // mutate while an explicit drag is in progress — no "tracks on hover" issue.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onBeginChange();
    dragRef.current = { startY: e.clientY, startValue: value };
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Vertical drag: up increases. Full range spans ~180px of travel; holding
    // Shift makes it 4× finer for precise tweaks.
    const pixelsForFullRange = e.shiftKey ? 720 : 180;
    const dyPx = drag.startY - e.clientY;
    commit(drag.startValue + (dyPx / pixelsForFullRange) * (max - min));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleDoubleClick = () => {
    if (!disabled) onReset();
  };

  return (
    <svg
      viewBox="0 0 44 44"
      className={`w-11 h-11 touch-none select-none ${disabled ? '' : 'cursor-ns-resize'}`}
      role="slider"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* Tick ring: lit up to the current value, dim beyond. */}
      {Array.from({ length: TICKS }, (_, i) => {
        const tt = i / (TICKS - 1);
        const [x1, y1] = polar(START_DEG + tt * SWEEP_DEG, 17);
        const [x2, y2] = polar(START_DEG + tt * SWEEP_DEG, 20.5);
        const lit = bipolar ? (tt >= centreT && tt <= t) || (tt <= centreT && tt >= t) : tt <= t;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={lit ? ACCENT : DIM}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        );
      })}
      {/* Knob body. */}
      <circle cx={CENTER} cy={CENTER} r={13} fill="#1b1b20" stroke="#3f3f46" strokeWidth={1} />
      <circle cx={CENTER} cy={CENTER} r={13} fill="none" stroke="#000" strokeOpacity={0.4} strokeWidth={0.5} />
      {/* Pointer notch. */}
      <line x1={CENTER} y1={CENTER} x2={ix} y2={iy} stroke={disabled ? DIM : ACCENT} strokeWidth={2} strokeLinecap="round" />
      <circle cx={ix} cy={iy} r={1.6} fill={disabled ? DIM : ACCENT} />
    </svg>
  );
}
