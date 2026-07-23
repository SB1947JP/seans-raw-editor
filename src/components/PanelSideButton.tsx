import { useUiMode } from '../state/uiMode';

/**
 * Flips the editing panel to the other side of the window. Lives in the top bar
 * beside Full screen — it's a property of the whole interface layout, like the
 * skin and fullscreen controls, rather than of any one section — and stays
 * reachable with nothing loaded.
 *
 * Desktop only: on the mobile layout the panel sits below the image, where
 * left/right has no meaning, so the button hides itself there (`hidden sm:flex`).
 */
export function PanelSideButton({ className }: { className?: string }) {
  const panelSide = useUiMode((s) => s.panelSide);
  const togglePanelSide = useUiMode((s) => s.togglePanelSide);
  const label = panelSide === 'right' ? 'Move panel to the left' : 'Move panel to the right';

  return (
    <button
      type="button"
      onClick={togglePanelSide}
      title={label}
      aria-label={label}
      className={`h-8 w-8 hidden sm:flex items-center justify-center rounded border font-medium text-neutral-400 border-neutral-700 hover:bg-neutral-900 ${className ?? ''}`}
    >
      <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
        <rect x="1" y="2.5" width="14" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x={panelSide === 'right' ? 9.5 : 1.5} y="3.2" width="5" height="9.6" rx="0.8" fill="currentColor" opacity="0.6" />
      </svg>
    </button>
  );
}
