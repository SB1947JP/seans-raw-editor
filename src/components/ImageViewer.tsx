import { useEffect, useLayoutEffect, useRef, useState, WheelEvent, PointerEvent } from 'react';
import { EditCanvas } from './EditCanvas';
import { CropOverlay } from './CropOverlay';
import { DecodedImage, EditParams } from '../types';
import { useCropTool, resolveLockedAspect } from '../state/cropTool';
import { useEditParams } from '../state/editParams';

type ZoomMode = { kind: 'fit' } | { kind: 'level'; scale: number };

const ZOOM_STEPS = [0.125, 0.25, 0.5, 1, 2, 4, 8];
const MIN_SCALE = ZOOM_STEPS[0];
const MAX_SCALE = ZOOM_STEPS[ZOOM_STEPS.length - 1];

function nextStep(scale: number, direction: 1 | -1): number {
  if (direction > 0) {
    const next = ZOOM_STEPS.find((s) => s > scale + 1e-6);
    return next ?? MAX_SCALE;
  }
  const prev = [...ZOOM_STEPS].reverse().find((s) => s < scale - 1e-6);
  return prev ?? MIN_SCALE;
}

interface Props {
  image: DecodedImage;
  params: EditParams;
  onHistogram?: (buckets: Uint32Array) => void;
}

export function ImageViewer({ image, params, onHistogram }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>({ kind: 'fit' });
  const [fitScale, setFitScale] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const dragRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const pendingFocusRef = useRef<{ x: number; y: number } | null>(null);

  const setCrop = useEditParams((s) => s.set);
  const beginChange = useEditParams((s) => s.beginChange);
  const ratio = useCropTool((s) => s.ratio);
  const orientation = useCropTool((s) => s.orientation);
  const setAutoRotationCrop = useCropTool((s) => s.setAutoRotationCrop);

  // Reset the view whenever a new image is loaded.
  useEffect(() => {
    setZoomMode({ kind: 'fit' });
  }, [image]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      setContainerSize({ width: cw, height: ch });
      setFitScale(Math.min(cw / image.width, ch / image.height, 1));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [image.width, image.height]);

  const scale = zoomMode.kind === 'fit' ? fitScale : zoomMode.scale;
  const cssWidth = image.width * scale;
  const cssHeight = image.height * scale;
  // Center each axis independently whenever that axis's content fits without
  // scrolling — a centered flex axis can't be scrolled into its "negative"
  // overflow region, so once an axis overflows it must be top/left anchored.
  // Treating this as one all-or-nothing flag (instead of per-axis) is what
  // caused portrait images at in-between zoom levels — width fits, height
  // overflows — to lose horizontal centering entirely.
  const fitsX = cssWidth <= containerSize.width + 0.5;
  const fitsY = cssHeight <= containerSize.height + 0.5;

  // After a zoom-level change that causes scrolling, re-center the scroll
  // position on whatever image point was requested as the focus (either the
  // cursor, for wheel-zoom, or the viewport center, for the +/- buttons) —
  // otherwise the browser resets scrollLeft/Top to 0, which visually yanks
  // the view to the top-left corner instead of keeping the same spot in view.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const target = pendingFocusRef.current;
    if (!container || !target) return;
    pendingFocusRef.current = null;
    if (!fitsX) container.scrollLeft = target.x * scale - container.clientWidth / 2;
    if (!fitsY) container.scrollTop = target.y * scale - container.clientHeight / 2;
  }, [scale, fitsX, fitsY]);

  const getImagePointAtClient = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return { x: image.width / 2, y: image.height / 2 };
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const zoomTo = (newScale: number, focus?: { x: number; y: number }) => {
    const container = containerRef.current;
    if (container && !focus) {
      const rect = container.getBoundingClientRect();
      focus = getImagePointAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    pendingFocusRef.current = focus ?? null;
    setZoomMode({ kind: 'level', scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale)) });
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain scroll pans; ctrl+wheel (or trackpad pinch) zooms
    e.preventDefault();
    const focus = getImagePointAtClient(e.clientX, e.clientY);
    const newScale = scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
    zoomTo(newScale, focus);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (fitsX && fitsY) return;
    const container = containerRef.current;
    if (!container) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop };
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;
    container.scrollLeft = drag.scrollLeft - (e.clientX - drag.x);
    container.scrollTop = drag.scrollTop - (e.clientY - drag.y);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  // Double-click recentres the image in the viewport. If the view is zoomed in
  // (image overflows and has been panned), snap the scroll back so the image's
  // centre sits in the middle of the viewport. If the image already fits, drop
  // back to Fit — which is inherently centred — so a double-click always
  // returns to a clean, centred view no matter the current state.
  const handleDoubleClick = () => {
    const container = containerRef.current;
    if (!container) return;
    if (fitsX && fitsY) {
      setZoomMode({ kind: 'fit' });
      return;
    }
    container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
    container.scrollTop = (container.scrollHeight - container.clientHeight) / 2;
  };

  const scalePercent = Math.round(scale * 100);
  const lockedAspect = resolveLockedAspect(ratio, orientation, image.width, image.height);

  return (
    <div className="flex flex-col h-full w-full min-h-0 min-w-0">
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className={`flex-1 min-h-0 min-w-0 overflow-auto overscroll-contain touch-none flex ${
          fitsX && fitsY ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{
          justifyContent: fitsX ? 'center' : 'flex-start',
          alignItems: fitsY ? 'center' : 'flex-start',
        }}
      >
        <div className="relative shrink-0" style={{ width: cssWidth, height: cssHeight }}>
          <EditCanvas
            image={image}
            params={params}
            onHistogram={onHistogram}
            style={{ width: '100%', height: '100%' }}
            applyCrop={false}
          />
          {params.crop && (
            <CropOverlay
              crop={params.crop}
              imageWidth={image.width}
              imageHeight={image.height}
              lockedAspect={lockedAspect}
              onBeginChange={beginChange}
              onChange={(crop) => {
                setAutoRotationCrop(false);
                setCrop('crop', crop);
              }}
            />
          )}
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 py-2 text-xs text-neutral-400 border-t border-neutral-800 shrink-0">
        <button
          onClick={() => zoomTo(nextStep(scale, -1))}
          disabled={scale <= MIN_SCALE + 1e-6}
          className="w-8 h-8 sm:w-6 sm:h-6 rounded hover:bg-neutral-900 disabled:opacity-30"
        >
          −
        </button>
        <button
          onClick={() => setZoomMode({ kind: 'fit' })}
          className="px-2 py-0.5 rounded hover:bg-neutral-900 tabular-nums min-w-[3.5rem]"
        >
          {zoomMode.kind === 'fit' ? `Fit (${scalePercent}%)` : `${scalePercent}%`}
        </button>
        <button onClick={() => zoomTo(1)} className="px-2 py-0.5 rounded hover:bg-neutral-900">
          100%
        </button>
        <button
          onClick={() => zoomTo(nextStep(scale, 1))}
          disabled={scale >= MAX_SCALE - 1e-6}
          className="w-8 h-8 sm:w-6 sm:h-6 rounded hover:bg-neutral-900 disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}
