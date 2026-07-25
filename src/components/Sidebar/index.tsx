import { PointerEvent as ReactPointerEvent, useState } from 'react';
import { useEditParams } from '../../state/editParams';
import { DEFAULT_PANEL_WIDTH, useUiMode } from '../../state/uiMode';
import { DecodedImage, RawMetadata } from '../../types';
import { HistogramData } from '../../lib/histogram';
import { ACCENT_BORDER, ACCENT_WASH, UI_COLORS } from '../../lib/palette';
import { Histogram } from '../Histogram';
import { FileBrowser } from '../FileBrowser';
import { FullscreenButton } from '../FullscreenButton';
import { PanelSideButton } from '../PanelSideButton';
import { useLibrary } from '../../state/library';
import { Auto } from './Auto';
import { Basic } from './Basic';
import { Tone } from './Tone';
import { Look } from './Look';
import { Color } from './Color';
import { Geometry } from './Geometry';

interface Props {
  metadata: RawMetadata | null;
  histogram: HistogramData | null;
  originalHistogram: HistogramData | null;
  image: DecodedImage | null;
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
  // Narrow selectors so the sidebar shell only re-renders for these specific
  // values, not on every slider drag.
  const tonemapMode = useEditParams((s) => s.params.tonemapMode);
  const setParam = useEditParams((s) => s.set);
  const beginChange = useEditParams((s) => s.beginChange);

  const dial = useUiMode((s) => s.controlStyle === 'dial');
  const toggleControlStyle = useUiMode((s) => s.toggleControlStyle);
  const panelSide = useUiMode((s) => s.panelSide);
  const sidebarTab = useUiMode((s) => s.sidebarTab);
  const setSidebarTab = useUiMode((s) => s.setSidebarTab);
  const fileCount = useLibrary((s) => s.items.length);
  const panelWidth = useUiMode((s) => s.panelWidth);
  const setPanelWidth = useUiMode((s) => s.setPanelWidth);

  // Drag-to-resize. Tracks against the pointer's own start position rather than
  // the window edge, so the grip stays under the cursor no matter which side
  // the panel is docked to; the store clamps the result to a usable range.
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      setPanelWidth(panelSide === 'right' ? startWidth - delta : startWidth + delta);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

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
    <div
      data-retro-chrome
      // The width lives in a CSS variable so the Tailwind breakpoint still
      // decides *whether* it applies — an inline width would also override the
      // full-width mobile layout, where the panel sits below the photo.
      className={`relative w-full sm:w-[var(--panel-w)] shrink-0 h-[45vh] sm:h-full bg-neutral-900 border-t sm:border-t-0 ${
        panelSide === 'left' ? 'sm:border-r' : 'sm:border-l'
      } border-neutral-800`}
      style={{ ['--panel-w' as string]: `${panelWidth}px` }}
    >
      {/* Grip on the panel's inner edge — the side facing the photo, which
          flips with panelSide. Outside the scrolling container below, or it
          would slide away with the content. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize editing panel"
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={() => setPanelWidth(DEFAULT_PANEL_WIDTH)}
        className={`hidden sm:block absolute top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-neutral-700 active:bg-neutral-600 ${
          panelSide === 'left' ? 'right-0' : 'left-0'
        }`}
      />
      <div className="h-full overflow-y-auto overscroll-contain p-3 sm:p-4">
      {/* Edit and Files share this one panel, so the window carries a single
          column of chrome beside the photo instead of one on either side. */}
      <div role="tablist" aria-label="Panel" className="flex gap-1 mb-3 p-0.5 rounded-md bg-neutral-950">
        {([
          { id: 'files', label: fileCount > 0 ? `Files (${fileCount})` : 'Files' },
          { id: 'edit', label: 'Edit' },
        ] as const).map((tab) => {
          const active = sidebarTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSidebarTab(tab.id)}
              className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
                active ? 'bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'
              }`}
              style={active ? { color: UI_COLORS.accent } : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {sidebarTab === 'files' ? (
        <FileBrowser />
      ) : (
        <>
      <div className="mb-4">
        <Histogram before={originalHistogram} after={histogram} />
      </div>
      {metadata && (
        <div className="mb-4 text-xs text-neutral-500">
          <div>{metadata.make} {metadata.model}</div>
          {metadata.iso !== undefined && (
            <div>
              ISO {metadata.iso} · f/{metadata.aperture !== undefined ? formatFStop(metadata.aperture) : '?'} · 1/
              {metadata.shutter ? Math.round(1 / metadata.shutter) : '?'}s
            </div>
          )}
        </div>
      )}

      {/* Divides what the file *is* (histogram, camera, exposure) from what you
          can do to it — everything below this line is a control. */}
      <hr className="mb-4 border-neutral-800" />

      {/* View options — presentation, not edits. The Dials toggle switches all
          controls between classic sliders and a Pioneer-DJ-mixer-style panel of
          rotary dials; the two square buttons beside it flip the panel to the
          other side of the window and enter full screen. All three are
          whole-interface view controls rather than edits, so they share a row
          here at the top of the panel. */}
      <div className="flex items-center gap-2 mb-2">
      <button
        type="button"
        role="switch"
        aria-checked={dial}
        onClick={toggleControlStyle}
        className="flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-2 rounded-md border transition-colors select-none"
        style={{
          borderColor: dial ? ACCENT_BORDER : UI_COLORS.muted,
          backgroundColor: dial ? ACCENT_WASH : 'transparent',
        }}
      >
        {/* Label and icon name the *destination*, not the current mode: the
            button's job is to get you to the other view, so while the dials are
            showing it offers "Sliders", and the switch on the right reads as
            "the dial mixer is engaged". */}
        <span
          className="flex items-center gap-2 text-xs font-semibold tracking-wide"
          style={{ color: dial ? UI_COLORS.accent : '#d4d4d8' }}
        >
          {dial ? (
            <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
              <line x1="2" y1="5.5" x2="14" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="6" cy="5.5" r="1.75" fill="currentColor" />
              <line x1="2" y1="10.5" x2="14" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="10.5" r="1.75" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <line x1="8" y1="8" x2="8" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
          {dial ? 'Sliders' : 'Dials'}
        </span>
        <span
          className="relative w-10 h-5 rounded-full transition-colors shrink-0"
          style={{ backgroundColor: dial ? UI_COLORS.heading : UI_COLORS.muted }}
        >
          {/* The knob inverts with the track. Now that "on" is a bright
              neutral rather than a colour, a pale knob on a pale track would
              disappear at exactly the moment the control is meant to read as
              active — so on a lit track the knob goes dark. */}
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
              dial ? 'translate-x-5 bg-neutral-900' : 'bg-neutral-100'
            }`}
          />
        </span>
      </button>
        <PanelSideButton className="shrink-0" />
        <FullscreenButton className="shrink-0" />
      </div>
      <button
        onClick={handleToggleAll}
        className="w-full mb-4 text-xs text-neutral-400 border border-neutral-700 rounded py-1.5 hover:bg-neutral-900"
      >
        {allOpen ? 'Hide' : 'Show'} All
      </button>

      {/* Tone mapper sits above the adjustment sections because it decides how
          the whole render behaves — every slider below it is applied through
          the transform chosen here — so it reads as a setting the rest of the
          panel hangs off, not as one more adjustment at the end of the list. */}
      <div className="mb-4">
        <div className="text-[11px] text-neutral-500 mb-1">Tone mapper</div>
        <select
          value={tonemapMode}
          onChange={(e) => {
            beginChange();
            setParam('tonemapMode', e.target.value as typeof tonemapMode);
          }}
          title="How highlights roll off to white. AgX (Blender's filmic view transform) desaturates extreme highlights gracefully toward white instead of clipping to a harsh colour."
          className="w-full bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-300 py-1 px-2"
        >
          <option value="agx">Modern (AgX)</option>
          <option value="classic">Classic</option>
        </select>
      </div>

      <Auto image={image} forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Basic forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Tone forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Look forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Color forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Geometry
        imageWidth={image?.width ?? null}
        imageHeight={image?.height ?? null}
        forceOpenSignal={toggleSignal}
        forceOpenValue={allOpen}
      />

      {/* Second and last rule in the panel, marking the same kind of boundary
          as the first: these two act on the whole edit rather than adjusting
          one part of it. Deliberately not repeated between every section —
          the headings already delimit those, and a rule above each one would
          compete with them instead of adding anything. */}
      <hr className="mt-5 mb-3 border-neutral-800" />

      <div className="flex gap-2">
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
          </>
        )}
      </div>
    </div>
  );
}
