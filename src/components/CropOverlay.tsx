import { useRef, PointerEvent as ReactPointerEvent } from 'react';
import { CropRect } from '../types';
import { CropHandle, moveCrop, resizeCrop } from '../lib/cropMath';

interface Props {
  crop: CropRect;
  imageWidth: number;
  imageHeight: number;
  lockedAspect: number | null;
  onChange: (crop: CropRect) => void;
  onBeginChange: () => void;
}

type DragMode = 'move' | CropHandle;

const HANDLES: { id: CropHandle; position: string; cursor: string }[] = [
  { id: 'nw', position: 'left-0 top-0', cursor: 'cursor-nwse-resize' },
  { id: 'n', position: 'left-1/2 top-0', cursor: 'cursor-ns-resize' },
  { id: 'ne', position: 'left-full top-0', cursor: 'cursor-nesw-resize' },
  { id: 'e', position: 'left-full top-1/2', cursor: 'cursor-ew-resize' },
  { id: 'se', position: 'left-full top-full', cursor: 'cursor-nwse-resize' },
  { id: 's', position: 'left-1/2 top-full', cursor: 'cursor-ns-resize' },
  { id: 'sw', position: 'left-0 top-full', cursor: 'cursor-nesw-resize' },
  { id: 'w', position: 'left-0 top-1/2', cursor: 'cursor-ew-resize' },
];

const EDGE_HANDLES = new Set<CropHandle>(['n', 's', 'e', 'w']);

export function CropOverlay({ crop, imageWidth, imageHeight, lockedAspect, onChange, onBeginChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: DragMode; startCrop: CropRect; startX: number; startY: number } | null>(null);

  const startDrag = (mode: DragMode) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onBeginChange();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode, startCrop: crop, startX: e.clientX, startY: e.clientY };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || !root) return;
    const rect = root.getBoundingClientRect();
    const dxFrac = (e.clientX - drag.startX) / rect.width;
    const dyFrac = (e.clientY - drag.startY) / rect.height;

    if (drag.mode === 'move') {
      onChange(moveCrop(drag.startCrop, dxFrac, dyFrac));
    } else {
      onChange(resizeCrop(drag.mode, drag.startCrop, dxFrac, dyFrac, lockedAspect, imageWidth, imageHeight));
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div ref={rootRef} className="absolute inset-0 pointer-events-none" onPointerMove={handlePointerMove} onPointerUp={endDrag}>
      <div
        className="absolute pointer-events-auto border border-white cursor-move"
        style={{
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.width * 100}%`,
          height: `${crop.height * 100}%`,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
        }}
        onPointerDown={startDrag('move')}
      >
        {HANDLES.filter((h) => !lockedAspect || !EDGE_HANDLES.has(h.id)).map((h) => (
          <div
            key={h.id}
            className={`absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 bg-white border border-neutral-900 rounded-sm pointer-events-auto ${h.position} ${h.cursor}`}
            onPointerDown={startDrag(h.id)}
          />
        ))}
      </div>
    </div>
  );
}
