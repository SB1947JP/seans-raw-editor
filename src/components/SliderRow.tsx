import { PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { useEditParams } from '../state/editParams';
import { useUiMode } from '../state/uiMode';
import { UI_COLORS } from '../lib/palette';
import { Knob } from './Knob';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function SliderRow({ label, value, min, max, step = 1, defaultValue = 0, disabled = false, onChange }: Props) {
  const beginChange = useEditParams((s) => s.beginChange);
  const dial = useUiMode((s) => s.controlStyle === 'dial');
  // Native dblclick is unreliable here: it's mouse-only (never fires for a
  // double-tap on touch/pen), and doesn't play well with setPointerCapture
  // below. Detecting the double-press ourselves (same pattern as
  // CurveEditor's reset-on-double-click) works uniformly across input types.
  const lastDownRef = useRef(0);

  // Editable numeric field state. While focused it holds the user's raw
  // keystrokes (so transient states like "-" or "1." feel natural) instead of
  // the clamped/snapped number; the real value is only committed on blur/Enter.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelRef = useRef(false);

  // Number of decimals the step implies (step 1 → 0, step 0.05 → 2), used to
  // both snap typed input to the slider's own granularity and format display.
  const decimals = (String(step).split('.')[1] || '').length;
  const format = (v: number) => String(parseFloat(v.toFixed(decimals)));

  const handleReset = () => {
    if (value === defaultValue) return;
    beginChange();
    onChange(defaultValue);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLInputElement>) => {
    const now = Date.now();
    const isDoubleClick = now - lastDownRef.current < 300;
    lastDownRef.current = now;
    if (isDoubleClick) {
      // Stop the native range input from also jumping the value to this
      // click's position before our reset applies.
      e.preventDefault();
      handleReset();
      return;
    }
    // Capture the pointer so every subsequent move is delivered to this slider
    // even if the finger/Pencil drifts off it — otherwise iPadOS can hand a
    // straying drag to page-scroll or Scribble mid-adjustment. Only for
    // touch/pen, though: on a mouse the native range already drags fine
    // without capture, and calling setPointerCapture on a range input trips a
    // WebKit bug where the thumb then follows the cursor on hover (no button
    // held) until the next click — which is exactly the desktop "moves on
    // hover" regression.
    if (e.pointerType !== 'mouse') {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    beginChange();
  };

  const commitDraft = () => {
    setEditing(false);
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    // Unchanged text (e.g. the user just clicked in and back out) must never
    // alter the value — otherwise focusing a field showing a non-step-aligned
    // value like an Auto-Levels result (1.88, shown while the true value sits
    // between steps) would snap it to 1.90 on blur, a silent edit the user
    // never asked for.
    if (draft === format(value)) return;
    const parsed = parseFloat(draft);
    if (Number.isNaN(parsed)) return; // gibberish/empty — leave the value as-is
    const snapped = Math.round(parsed / step) * step;
    const clamped = Math.min(max, Math.max(min, parseFloat(snapped.toFixed(decimals))));
    if (clamped === value) return;
    beginChange();
    onChange(clamped);
  };

  // The editable value field, shared by both layouts (only its sizing/anchor
  // differs). Kept as one element so the commit/parse logic isn't duplicated.
  const valueField = (className: string) => (
    <input
      type="text"
      // Bipolar sliders need a minus key; iOS's "decimal" keypad has none,
      // so fall back to the full keyboard there. Non-negative sliders
      // (Sharpen) keep the tidy numeric pad.
      inputMode={min < 0 ? 'text' : 'decimal'}
      aria-label={`${label} value`}
      disabled={disabled}
      value={editing ? draft : format(value)}
      onFocus={(e) => {
        setEditing(true);
        setDraft(format(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur(); // commits via onBlur
        } else if (e.key === 'Escape') {
          cancelRef.current = true; // onBlur then discards the draft
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );

  const fieldBase =
    'tabular-nums bg-transparent text-neutral-500 rounded px-1 select-text focus:bg-neutral-950 focus:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-600 disabled:cursor-not-allowed';

  // --- Dial (mixer) layout ---------------------------------------------------
  if (dial) {
    return (
      <div className={`flex flex-col items-center gap-0.5 py-1 text-xs text-neutral-400 select-none ${disabled ? 'opacity-40' : ''}`}>
        {/* whitespace-nowrap, not truncate: truncate's overflow:hidden clips
            descenders (g/p/y) in the tight line box. The label set all fits. */}
        <span className="whitespace-nowrap">{label}</span>
        <Knob
          value={value}
          min={min}
          max={max}
          step={step}
          defaultValue={defaultValue}
          disabled={disabled}
          bipolar={defaultValue > min && defaultValue < max}
          accent={UI_COLORS.accent}
          onBeginChange={beginChange}
          onChange={onChange}
          onReset={handleReset}
        />
        {valueField(`${fieldBase} w-14 text-center`)}
      </div>
    );
  }

  // --- Classic slider layout -------------------------------------------------
  // A centre "0" tick only makes sense on bipolar sliders (those whose default
  // sits strictly inside the range, e.g. −100..100). For 0-based sliders like
  // Sharpen the default is the left edge, where a tick would be meaningless.
  const showTick = defaultValue > min && defaultValue < max;
  const tickPct = ((defaultValue - min) / (max - min)) * 100;

  return (
    <div className={`block mb-3 text-xs text-neutral-400 select-none ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex justify-between items-center mb-1">
        <span>{label}</span>
        {valueField(`${fieldBase} w-12 text-right`)}
      </div>
      <div className="relative flex items-center h-5">
        {/* Track (drawn here so the tick can sit on it, beneath the thumb). */}
        <div
          data-retro-track
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[#3f3f46]"
        />
        {showTick && (
          <div
            aria-hidden
            data-retro-tick
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5 rounded-full bg-neutral-500"
            style={{ left: `calc(${tickPct}% - 1px)` }}
          />
        )}
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onPointerDown={handlePointerDown}
          onChange={(e) => onChange(Number(e.target.value))}
          title={`Double-click/tap to reset to ${defaultValue}`}
          className="relative w-full disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
