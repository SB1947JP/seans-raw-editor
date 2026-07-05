import { CSSProperties, useEffect, useRef } from 'react';
import { RawRenderer } from '../gl/renderer';
import { DecodedImage, EditParams } from '../types';
import { computeLumaHistogram } from '../lib/histogram';

interface Props {
  image: DecodedImage;
  params: EditParams;
  onHistogram?: (buckets: Uint32Array) => void;
  style?: CSSProperties;
  /** False for interactive editing (always show the full frame so the crop
   *  box overlay has room to drag), true to actually bake the crop in. */
  applyCrop?: boolean;
}

export function EditCanvas({ image, params, onHistogram, style, applyCrop = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RawRenderer | null>(null);
  const rafRef = useRef<number>();

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
    renderer.render(params, applyCrop);

    if (onHistogram) {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const { data, width, height } = renderer.readPixels();
        onHistogram(computeLumaHistogram(data, width, height));
      });
    }
  }, [image, params, onHistogram, applyCrop]);

  return <canvas ref={canvasRef} style={style} className="block" />;
}
