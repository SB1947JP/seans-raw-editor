import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { ImageViewer } from './components/ImageViewer';
import { Sidebar } from './components/Sidebar';
import { ExportButton } from './components/ExportButton';
import { Logo } from './components/Logo';
import { decodePreview, friendlyDecodeError, isSupportedRawFile } from './lib/rawDecoder';
import { computeImageRgbHistogram, HistogramData } from './lib/histogram';
import { loadSession, saveSession, clearSession } from './lib/sessionStore';
import { JAPANESE_PALETTE } from './lib/palette';
import { useEditParams } from './state/editParams';
import { useCropTool } from './state/cropTool';
import { useUiMode } from './state/uiMode';
import { DecodedImage, RawMetadata } from './types';

// 'booting' is the brief window while the last session is being read from
// IndexedDB — kept distinct from 'empty' so the dropzone doesn't flash on
// screen for the ~10ms it takes to find out there's actually a file to restore.
type Status = 'booting' | 'empty' | 'loading' | 'ready' | 'error';

export default function App() {
  const [status, setStatus] = useState<Status>('booting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [preview, setPreview] = useState<DecodedImage | null>(null);
  const [metadata, setMetadata] = useState<RawMetadata | null>(null);
  const [histogram, setHistogram] = useState<HistogramData | null>(null);
  const [loadingFileName, setLoadingFileName] = useState('');
  const params = useEditParams((s) => s.params);
  const resetParams = useEditParams((s) => s.reset);
  const undo = useEditParams((s) => s.undo);
  const resetCropToolForNewImage = useCropTool((s) => s.resetForNewImage);
  const panelSide = useUiMode((s) => s.panelSide);
  const abortRef = useRef<AbortController | null>(null);

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

  // Shared by both a fresh file drop and a restored session. `isNewFile`
  // gates whether edit params / crop state reset to defaults — a restore
  // must leave them alone, since they were already repopulated from
  // localStorage by zustand's `persist` middleware when the stores were
  // created, and resetting here would silently wipe them back to defaults
  // on every single page refresh.
  const runDecode = useCallback(
    async (name: string, bytes: Uint8Array<ArrayBuffer>, isNewFile: boolean) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('loading');
      setErrorMessage(null);
      setLoadingFileName(name);
      try {
        const { image, metadata } = await decodePreview(bytes, controller.signal);
        if (isNewFile) {
          resetParams();
          resetCropToolForNewImage();
        }
        setFileBytes(bytes);
        setFileName(name);
        setPreview(image);
        setMetadata(metadata);
        setStatus('ready');
        void saveSession({ fileName: name, bytes });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setStatus('empty'); // user-initiated cancel — not a failure, no message
          return;
        }
        // A corrupted or incompatible cached session shouldn't be able to
        // wedge every future page load — clear it and fall back cleanly.
        if (!isNewFile) void clearSession();
        setErrorMessage(friendlyDecodeError(err));
        setStatus('error');
      } finally {
        abortRef.current = null;
      }
    },
    [resetParams, resetCropToolForNewImage],
  );

  // On mount, try to resume the last session instead of always starting at
  // the empty dropzone — this is the actual fix for "refreshing loses the file."
  useEffect(() => {
    (async () => {
      const session = await loadSession();
      if (session) {
        // IndexedDB's structured clone loses the specific ArrayBuffer-vs-
        // SharedArrayBuffer type parameter, but the bytes were always written
        // by saveSession() from a real ArrayBuffer-backed Uint8Array.
        await runDecode(session.fileName, session.bytes as Uint8Array<ArrayBuffer>, false);
      } else {
        setStatus('empty');
      }
    })();
  }, [runDecode]);

  const handleFile = useCallback(
    async (file: File) => {
      // Drag-and-drop bypasses the file input's `accept` filter (which only
      // constrains the OS picker), so without this check dropping e.g. a JPEG
      // would sail through to a doomed LibRaw decode and surface a cryptic
      // native error instead of an immediate, clear message.
      if (!isSupportedRawFile(file.name)) {
        setErrorMessage(`"${file.name}" doesn't look like a RAW file. Drop a camera RAW file.`);
        setStatus('error');
        return;
      }
      setStatus('loading');
      setLoadingFileName(file.name);
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      await runDecode(file.name, bytes, true);
    },
    [runDecode],
  );

  const handleCancelLoad = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Forgets the current file entirely — clears the persisted session too, so
  // a refresh doesn't bring it back (unlike "Open file", which just returns
  // to the dropzone without discarding anything, in case the user cancels).
  const handleDeleteFile = useCallback(async () => {
    await clearSession();
    setFileBytes(null);
    setFileName('');
    setPreview(null);
    setMetadata(null);
    setHistogram(null);
    setStatus('empty');
  }, []);

  const handleHistogram = useCallback((h: HistogramData) => setHistogram(h), []);
  const originalHistogram = useMemo(() => (preview ? computeImageRgbHistogram(preview) : null), [preview]);
  const hasImage = status === 'ready' && preview !== null;

  return (
    <div className="flex flex-col h-screen w-screen bg-neutral-950">
      <header className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 border-b border-neutral-800 shrink-0">
        <Logo className="shrink-0" />
        {status === 'ready' && fileBytes && (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => setStatus('empty')}
              className="h-8 px-2.5 flex items-center justify-center text-xs rounded border font-medium hover:bg-neutral-900 whitespace-nowrap"
              style={{ borderColor: JAPANESE_PALETTE.asagiiro, color: JAPANESE_PALETTE.asagiiro }}
            >
              Open file
            </button>
            <button
              onClick={handleDeleteFile}
              className="h-8 px-2.5 flex items-center justify-center text-xs rounded border font-medium hover:bg-neutral-900 whitespace-nowrap"
              style={{ borderColor: JAPANESE_PALETTE.enjiiro, color: JAPANESE_PALETTE.enjiiro }}
            >
              Delete file
            </button>
            <ExportButton fileBytes={fileBytes} fileName={fileName} params={params} />
          </div>
        )}
      </header>

      <div className={`flex flex-col flex-1 min-h-0 ${panelSide === 'left' ? 'sm:flex-row-reverse' : 'sm:flex-row'}`}>
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {status !== 'ready' && (
            <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
              {status === 'empty' && <Dropzone onFile={handleFile} />}
              {status === 'loading' && (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-6 h-6 rounded-full border-2 border-neutral-700 border-t-neutral-300 animate-spin" />
                  <p className="text-neutral-400 text-sm truncate max-w-xs">Decoding {loadingFileName}…</p>
                  <button
                    onClick={handleCancelLoad}
                    className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              )}
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
        <Sidebar
          metadata={hasImage ? metadata : null}
          histogram={hasImage ? histogram : null}
          originalHistogram={hasImage ? originalHistogram : null}
          image={hasImage ? preview : null}
        />
      </div>
    </div>
  );
}
