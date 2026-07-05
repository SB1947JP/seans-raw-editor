import { create } from 'zustand';
import { DEFAULT_EDIT_PARAMS, EditParams } from '../types';

interface EditParamsStore {
  params: EditParams;
  history: EditParams[];
  pendingSnapshot: EditParams | null;
  /** Call once at the start of a gesture (pointer down, checkbox toggle) so the
   *  next `set()` records one undo step instead of one per intermediate value. */
  beginChange: () => void;
  set: <K extends keyof EditParams>(key: K, value: EditParams[K]) => void;
  undo: () => void;
  reset: () => void;
}

export const useEditParams = create<EditParamsStore>((set, get) => ({
  params: { ...DEFAULT_EDIT_PARAMS },
  history: [],
  pendingSnapshot: null,
  beginChange: () => {
    if (!get().pendingSnapshot) {
      set((state) => ({ pendingSnapshot: state.params }));
    }
  },
  set: (key, value) =>
    set((state) => ({
      params: { ...state.params, [key]: value },
      history: state.pendingSnapshot ? [...state.history, state.pendingSnapshot] : state.history,
      pendingSnapshot: null,
    })),
  undo: () =>
    set((state) => {
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      return { params: previous, history: state.history.slice(0, -1), pendingSnapshot: null };
    }),
  reset: () => set({ params: { ...DEFAULT_EDIT_PARAMS }, history: [], pendingSnapshot: null }),
}));
