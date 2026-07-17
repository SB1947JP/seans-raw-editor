import { create } from 'zustand';

/** How the adjustment controls are drawn: classic horizontal sliders, or a
 *  Pioneer-DJ-mixer-style panel of rotary dials. Purely a presentation choice
 *  (it changes nothing about the edit params), so it lives in its own tiny
 *  session-local store rather than in the persisted EditParams schema. */
export type ControlStyle = 'slider' | 'dial';

interface UiModeStore {
  controlStyle: ControlStyle;
  setControlStyle: (style: ControlStyle) => void;
  toggleControlStyle: () => void;
}

export const useUiMode = create<UiModeStore>((set) => ({
  controlStyle: 'slider',
  setControlStyle: (controlStyle) => set({ controlStyle }),
  toggleControlStyle: () => set((s) => ({ controlStyle: s.controlStyle === 'slider' ? 'dial' : 'slider' })),
}));
