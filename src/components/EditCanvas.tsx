import { CSSProperties, useEffect, useRef } from 'react';
import { RawRenderer } from '../gl/renderer';
import { DecodedImage, EditParams } from '../types';
import { computeRgbHistogram, HistogramData } from '../lib/histogram';

// The histogram costs a full-canvas gl.readPixels (a GPU->CPU stall) plus a
// per-pixel JS pass — together ~150ms on the 6MP preview. Recompute it only
// once the edit values settle, not on every drag frame; see the effect below.
const HISTOGRAM_DEBOUNCE_MS = 140;

interface Props {
  image: DecodedImage;
  params: EditParams;
  onHistogram?: (histogram: HistogramData) => void;
  style?: CSSProperties;
  /** False for interactive editing (always show the full frame so the crop
   *  box overlay has room to drag), true to actually bake the crop in. */
  applyCrop?: boolean;
}

export function EditCanvas({ image, params, onHistogram, style, applyCrop = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RawRenderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new RawRenderer(canvasRef.current);
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setImage(image);
  }, [image]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    // The image itself is redrawn on every change — the draw is cheap, so the
    // canvas tracks the slider frame for frame.
    renderer.render(params, applyCrop);

    if (!onHistogram) return;
    // The histogram readback is not cheap, and doing it every drag frame was
    // what made the slider thumbs feel sticky: a controlled range input can
    // only move as fast as the main thread frees up, and each ~150ms readback
    // froze it. Debounce so it recomputes once the drag settles; while values
    // keep changing this timer keeps resetting and never fires.
    const timer = window.setTimeout(() => {
      // readPixels has to follow its own render() in the same tick: with no
      // preserveDrawingBuffer, the buffer the drag left behind has by now been
      // composited away to zeros, so re-draw the final frame before reading it.
      renderer.render(params, applyCrop);
      const { data, width, height } = renderer.readPixels();
      onHistogram(computeRgbHistogram(data, width, height));
    }, HISTOGRAM_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [image, params, onHistogram, applyCrop]);

  return <canvas ref={canvasRef} style={style} className="block" />;
}
