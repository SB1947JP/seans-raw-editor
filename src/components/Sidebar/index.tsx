import { useState } from 'react';
import { useEditParams } from '../../state/editParams';
import { useUiMode } from '../../state/uiMode';
import { DecodedImage, RawMetadata } from '../../types';
import { HistogramData } from '../../lib/histogram';
import { JAPANESE_PALETTE } from '../../lib/palette';
import { Histogram } from '../Histogram';
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
  const togglePanelSide = useUiMode((s) => s.togglePanelSide);

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
      className={`w-full sm:w-72 shrink-0 h-[45vh] sm:h-full overflow-y-auto overscroll-contain bg-neutral-900 border-t sm:border-t-0 ${
        panelSide === 'left' ? 'sm:border-r' : 'sm:border-l'
      } border-neutral-800 p-3 sm:p-4`}
    >
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

      {/* View options — presentation, not edits. Toggles all controls between
          classic sliders and a Pioneer-DJ-mixer-style panel of rotary dials. */}
      <button
        type="button"
        role="switch"
        aria-checked={dial}
        onClick={toggleControlStyle}
        className="w-full flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-md border transition-colors select-none"
        style={{
          borderColor: dial ? JAPANESE_PALETTE.asagiiro : '#52525b',
          backgroundColor: dial ? 'rgba(96,139,149,0.15)' : 'transparent',
        }}
      >
        <span
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
          style={{ color: dial ? JAPANESE_PALETTE.asagiiro : '#d4d4d8' }}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="8" y1="8" x2="8" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Dial mixer
        </span>
        <span
          className="relative w-10 h-5 rounded-full transition-colors shrink-0"
          style={{ backgroundColor: dial ? JAPANESE_PALETTE.asagiiro : '#52525b' }}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-neutral-100 transition-transform ${dial ? 'translate-x-5' : ''}`}
          />
        </span>
      </button>
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleToggleAll}
          className="flex-1 text-xs text-neutral-400 border border-neutral-700 rounded py-1.5 hover:bg-neutral-900"
        >
          {allOpen ? 'Hide' : 'Show'} All
        </button>
        {/* Move the whole panel to the other side (desktop only — on mobile it
            sits below the image, where left/right doesn't apply). */}
        <button
          type="button"
          onClick={togglePanelSide}
          title={panelSide === 'right' ? 'Move panel to the left' : 'Move panel to the right'}
          aria-label={panelSide === 'right' ? 'Move panel to the left' : 'Move panel to the right'}
          className="hidden sm:flex shrink-0 items-center justify-center px-2 text-neutral-400 border border-neutral-700 rounded hover:bg-neutral-900"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
            <rect x="1" y="2.5" width="14" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <rect x={panelSide === 'right' ? 9.5 : 1.5} y="3.2" width="5" height="9.6" rx="0.8" fill="currentColor" opacity="0.6" />
          </svg>
        </button>
      </div>

      <Basic image={image} forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Tone forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Look forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Color forceOpenSignal={toggleSignal} forceOpenValue={allOpen} />
      <Geometry
        imageWidth={image?.width ?? null}
        imageHeight={image?.height ?? null}
        forceOpenSignal={toggleSignal}
        forceOpenValue={allOpen}
      />

      {/* Tone mapper is a set-once rendering choice, so it lives down here out
          of the adjustment flow rather than at the top of Basic. */}
      <div className="mt-1 mb-3">
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
    </div>
  );
}
