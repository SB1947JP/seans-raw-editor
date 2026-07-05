import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { ImageViewer } from './components/ImageViewer';
import { Sidebar } from './components/Sidebar';
import { ExportButton } from './components/ExportButton';
import { decodePreview } from './lib/rawDecoder';
import { computeImageHistogram } from './lib/histogram';
import { useEditParams } from './state/editParams';
import { DecodedImage, RawMetadata } from './types';

type Status = 'empty' | 'loading' | 'ready' | 'error';

export default function App() {
  const [status, setStatus] = useState<Status>('empty');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [preview, setPreview] = useState<DecodedImage | null>(null);
  const [metadata, setMetadata] = useState<RawMetadata | null>(null);
  const [histogram, setHistogram] = useState<Uint32Array | null>(null);
  const params = useEditParams((s) => s.params);
  const resetParams = useEditParams((s) => s.reset);
  const undo = useEditParams((s) => s.undo);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
      if (isUndo) {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo]);

  const handleFile = useCallback(
    async (file: File) => {
      setStatus('loading');
      setErrorMessage(null);
      try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const { image, metadata } = await decodePreview(bytes);
        resetParams();
        setFileBytes(bytes);
        setFileName(file.name);
        setPreview(image);
        setMetadata(metadata);
        setStatus('ready');
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to decode RAW file');
        setStatus('error');
      }
    },
    [resetParams],
  );

  const handleHistogram = useCallback((buckets: Uint32Array) => setHistogram(buckets), []);
  const originalHistogram = useMemo(() => (preview ? computeImageHistogram(preview) : null), [preview]);

  return (
    <div className="flex flex-col h-screen w-screen bg-neutral-950">
      <header className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 shrink-0">
        <h1 className="text-sm font-semibold text-neutral-300">Lumix RAW Editor</h1>
        {status === 'ready' && fileBytes && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStatus('empty')}
              className="text-xs text-neutral-400 hover:text-neutral-200"
            >
              Open different file
            </button>
            <ExportButton fileBytes={fileBytes} fileName={fileName} params={params} />
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {status !== 'ready' && (
            <div className="flex-1 flex items-center justify-center p-6">
              {status === 'empty' && <Dropzone onFile={handleFile} />}
              {status === 'loading' && <p className="text-neutral-400 text-sm">Decoding RAW file…</p>}
              {status === 'error' && (
                <div className="text-center">
                  <p className="text-red-400 text-sm mb-3">{errorMessage}</p>
                  <button
                    onClick={() => setStatus('empty')}
                    className="text-xs text-neutral-400 border border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-900"
                  >
                    Try another file
                  </button>
                </div>
              )}
            </div>
          )}
          {status === 'ready' && preview && (
            <ImageViewer image={preview} params={params} onHistogram={handleHistogram} />
          )}
        </main>
        {status === 'ready' && preview && (
          <Sidebar
            metadata={metadata}
            histogram={histogram}
            originalHistogram={originalHistogram}
            image={preview}
          />
        )}
      </div>
    </div>
  );
}
