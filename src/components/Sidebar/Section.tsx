import { ReactNode, useState } from 'react';
import { UI_COLORS } from '../../lib/palette';

interface Props {
  title: string;
  children: ReactNode;
  /** Whether the section starts expanded (default true). */
  defaultOpen?: boolean;
  /** Bump this (e.g. a counter) to force `open` to `forceOpenValue` — used by
   *  a global "Show/Hide All" control. Left undefined, the section is purely
   *  self-managed as before. */
  forceOpenSignal?: number;
  forceOpenValue?: boolean;
}

export function Section({ title, children, defaultOpen = true, forceOpenSignal, forceOpenValue }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  // Sync `open` to an external "force all sections open/closed" signal without
  // remounting the section (a key-based remount would also wipe out any other
  // local state living alongside it, e.g. Basic's own show/hide toggle) — this
  // is React's documented "adjust state during render when a prop changes"
  // pattern: compare against the previous signal value and call setState
  // directly in render, which re-renders immediately with no flicker/effect.
  const [lastSignal, setLastSignal] = useState(forceOpenSignal);
  if (forceOpenSignal !== undefined && forceOpenSignal !== lastSignal) {
    setLastSignal(forceOpenSignal);
    setOpen(forceOpenValue ?? true);
  }

  return (
    <div className="mb-5">
      <button
        type="button"
        data-retro-title
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between mb-2 select-none group"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: UI_COLORS.heading }}>
          {title}
        </h3>
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke={UI_COLORS.heading}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`opacity-60 transition-transform group-hover:opacity-100 ${open ? '' : '-rotate-90'}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}
