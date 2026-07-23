import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** How the adjustment controls are drawn: classic horizontal sliders, or a
 *  Pioneer-DJ-mixer-style panel of rotary dials. Purely a presentation choice
 *  (it changes nothing about the edit params), so it lives in its own tiny
 *  store rather than in the persisted EditParams schema. */
export type ControlStyle = 'slider' | 'dial';

/** Which side of the window the editing panel sits on (desktop layout). */
export type PanelSide = 'left' | 'right';

/** Which tab of the editing panel is showing: the adjustment controls, or the
 *  file browser. They share one panel so the window holds a single column of
 *  chrome beside the photo rather than one on each side. */
export type SidebarTab = 'edit' | 'files';

/** Whether the viewer shows the edited photo or the untouched original, for
 *  A/B comparison. Session-local and never persisted: a reload must start on
 *  the edited image, never on a 'before' that would look like lost work. */
export type ImageView = 'before' | 'after';

/** Export resolution tier — how big the saved JPEG is by its longer edge.
 *  'high' keeps full resolution; 'medium'/'low' downscale for smaller files
 *  and web/sharing use. Quality (JPEG compression) is unchanged across tiers. */
export type ExportSize = 'high' | 'medium' | 'low';

/** Longer-edge cap in px for each tier; null = no downscale (full resolution). */
export const EXPORT_MAX_EDGE: Record<ExportSize, number | null> = {
  high: null,
  medium: 2048,
  low: 1024,
};

/** 288px — the w-72 the panel used before it became resizable. */
export const DEFAULT_PANEL_WIDTH = 288;
const MIN_PANEL_WIDTH = 240; // below this the dial mixer's two columns collapse
const MAX_PANEL_WIDTH = 560;

/** Clamped on the way in, so a stale or hand-edited persisted value can't
 *  restore a panel that's off-screen or too narrow to use. */
export function clampPanelWidth(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_PANEL_WIDTH;
  return Math.round(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, px)));
}

interface UiModeStore {
  controlStyle: ControlStyle;
  setControlStyle: (style: ControlStyle) => void;
  toggleControlStyle: () => void;
  panelSide: PanelSide;
  setPanelSide: (side: PanelSide) => void;
  togglePanelSide: () => void;
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  /** 'before'/'after' comparison of the photo itself (see ImageView). */
  imageView: ImageView;
  setImageView: (view: ImageView) => void;
  /** Export resolution tier (see ExportSize). Persisted — a chosen output size
   *  is a preference worth remembering across reloads. */
  exportSize: ExportSize;
  setExportSize: (size: ExportSize) => void;
  /** Editing panel width in px (desktop only; it spans the full width on mobile). */
  panelWidth: number;
  setPanelWidth: (px: number) => void;
  /** 1-bit "1984 Macintosh" skin over the whole interface. The photograph
   *  itself is deliberately exempt — the point is to reskin the tool, not to
   *  misrepresent the image being edited. */
  retro: boolean;
  toggleRetro: () => void;
}

export const useUiMode = create<UiModeStore>()(
  persist(
    (set) => ({
      controlStyle: 'slider',
      setControlStyle: (controlStyle) => set({ controlStyle }),
      toggleControlStyle: () => set((s) => ({ controlStyle: s.controlStyle === 'slider' ? 'dial' : 'slider' })),
      panelSide: 'right',
      setPanelSide: (panelSide) => set({ panelSide }),
      togglePanelSide: () => set((s) => ({ panelSide: s.panelSide === 'right' ? 'left' : 'right' })),
      sidebarTab: 'edit',
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      imageView: 'after',
      setImageView: (imageView) => set({ imageView }),
      exportSize: 'high',
      setExportSize: (exportSize) => set({ exportSize }),
      panelWidth: DEFAULT_PANEL_WIDTH,
      setPanelWidth: (px) => set({ panelWidth: clampPanelWidth(px) }),
      retro: false,
      toggleRetro: () => set((s) => ({ retro: !s.retro })),
    }),
    {
      name: 'lumix-ui-mode',
      // Layout choices are worth remembering across reloads; the dial mixer
      // intentionally starts off each session.
      partialize: (s) => ({
        panelSide: s.panelSide,
        sidebarTab: s.sidebarTab,
        panelWidth: s.panelWidth,
        exportSize: s.exportSize,
      }),
    },
  ),
);
