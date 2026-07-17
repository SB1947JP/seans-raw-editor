import { ReactNode } from 'react';
import { useUiMode } from '../../state/uiMode';

/** Wraps a run of SliderRows. In slider mode it's a transparent passthrough
 *  (the rows keep stacking); in dial mode it lays them out as a 2-column grid
 *  of knobs — the Pioneer-DJ-mixer look. */
export function ControlGroup({ children }: { children: ReactNode }) {
  const dial = useUiMode((s) => s.controlStyle === 'dial');
  return <div className={dial ? 'grid grid-cols-2 gap-x-2 gap-y-1 mb-3' : ''}>{children}</div>;
}
