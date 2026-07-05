import { useState } from 'react';
import { decodeFull } from '../lib/rawDecoder';
import { RawRenderer } from '../gl/renderer';
import { EditParams } from '../types';

interface Props {
  fileBytes: Uint8Array<ArrayBuffer>;
  fileName: string;
  params: EditParams;
}

export function ExportButton({ fileBytes, fileName, params }: Props) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const { image } = await decodeFull(fileBytes);
      const canvas = document.createElement('canvas');
      const renderer = new RawRenderer(canvas);
      renderer.setImage(image);
      renderer.render(params);
      const dataUrl = renderer.toDataUrl('image/jpeg', 0.92);
      renderer.dispose();

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileName.replace(/\.[^.]+$/, '')}_edited.jpg`;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-4 py-1.5 text-sm rounded bg-neutral-100 text-neutral-900 font-medium disabled:opacity-50"
      >
        {exporting ? 'Exporting…' : 'Export JPEG'}
      </button>
    </div>
  );
}
