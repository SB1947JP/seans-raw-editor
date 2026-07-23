import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { ImageViewer } from './components/ImageViewer';
import { Sidebar } from './components/Sidebar';
import { ExportButton } from './components/ExportButton';
import { FullscreenButton } from './components/FullscreenButton';
import { PanelSideButton } from './components/PanelSideButton';
import { Logo } from './components/Logo';
import { decodePreview, friendlyDecodeError, isSupportedRawFile } from './lib/rawDecoder';
import { computeImageRgbHistogram, HistogramData } from './lib/histogram';
import { loadSession, saveSession, clearSession } from './lib/sessionStore';
import { ACCENT_BORDER, UI_COLORS } from './lib/palette';
import { useEditParams, useRenderParams } from './state/editParams';
import { useCropTool } from './state/cropTool';
import { useUiMode } from './state/uiMode';
import { libraryIdFor, useLibrary } from './state/library';
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
  // The viewer shows hover previews; export must not — it has to write what
  // the user actually committed, not whatever they were pointing at.
  const renderParams = useRenderParams();
  const resetParams = useEditParams((s) => s.reset);
  const undo = useEditParams((s) => s.undo);
  const resetCropToolForNewImage = useCropTool((s) => s.resetForNewImage);
  const panelSide = useUiMode((s) => s.panelSide);
  const retro = useUiMode((s) => s.retro);
  const toggleRetro = useUiMode((s) => s.toggleRetro);
  const addToLibrary = useLibrary((s) => s.addFiles);
  const selectInLibrary = useLibrary((s) => s.select);
  const librarySelectedId = useLibrary((s) => s.selectedId);
  const libraryItems = useLibrary((s) => s.items);
  // Which library file the editor currently holds, so re-renders and unrelated
  // library changes (probes finishing, tags being added) can't retrigger a decode.
  const loadedLibraryIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Never steal keys from a field the user is typing into — the keyword
      // box and every slider's numeric input both rely on Return.
      const el = e.target as HTMLElement | null;
      // BUTTON is in here too: Return on a focused button must activate that
      // button, which is what a keyboard user expects — stealing the key for
      // the crop would break every control in the panel.
      const typing =
        !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName));

      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
      if (isUndo) {
        e.preventDefault();
        undo();
        return;
      }
      // Return commits the crop: the viewer drops the discarded area and shows
      // just the kept frame. Pressing it again reopens the crop box, so it's a
      // reversible preview rather than a destructive step (the crop rect is
      // untouched either way, and export has always baked it in regardless).
      if (e.key === 'Enter' && !typing) {
        // Read through getState() so this listener needs no dependency on the
        // crop rect and can stay registered for the life of the app.
        if (!useEditParams.getState().params.crop) return;
        e.preventDefault();
        const cropTool = useCropTool.getState();
        cropTool.setCropApplied(!cropTool.cropApplied);
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
      // Everything opened this way also joins the browser list, so a file
      // dropped straight onto the viewer can still be tagged and mapped.
      addToLibrary([file]);
      const id = libraryIdFor(file);
      selectInLibrary(id);
      // Claim the decode here rather than letting the selection effect below
      // do it a second time.
      loadedLibraryIdRef.current = id;

      setStatus('loading');
      setLoadingFileName(file.name);
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      await runDecode(file.name, bytes, true);
    },
    [runDecode, addToLibrary, selectInLibrary],
  );

  // Picking a different photo in the browser loads it into the editor. Treated
  // as a new file (params reset), since carrying one photo's exposure and crop
  // onto the next one is never what's wanted.
  useEffect(() => {
    if (!librarySelectedId || librarySelectedId === loadedLibraryIdRef.current) return;
    const item = libraryItems.find((i) => i.id === librarySelectedId);
    if (!item) return;
    loadedLibraryIdRef.current = librarySelectedId;
    void (async () => {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      await runDecode(item.name, bytes, true);
    })();
  }, [librarySelectedId, libraryItems, runDecode]);

  const handleCancelLoad = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Forgets the current file entirely — clears the persisted session too, so
  // a refresh doesn't bring it back (unlike "Open file", which just returns
  // to the dropzone without discarding anything, in case the user cancels).
  const handleDeleteFile = useCallback(async () => {
    await clearSession();
    // Release the claim so re-picking the same browser entry reloads it
    // instead of being mistaken for the file that's already open.
    loadedLibraryIdRef.current = null;
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
    <div className="flex flex-col h-screen w-screen bg-neutral-950" data-retro={retro ? '' : undefined}>
      <header
        data-retro-chrome
        className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 border-b border-neutral-800 shrink-0"
      >
        <Logo className="shrink-0" />
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {status === 'ready' && fileBytes && (
            <>
              <button
                onClick={handleDeleteFile}
                className="h-8 px-2.5 flex items-center justify-center text-xs rounded border font-medium hover:bg-neutral-900 whitespace-nowrap"
                // Drawn in the same neutral as Export beside it: the red made
                // it the loudest thing in a window whose whole point is the
                // photograph, and it was the last hue left in the chrome.
                // Defensible because the action isn't destructive in the way
                // the red implied — it forgets the *loaded* file and its saved
                // session, and never touches the RAW on disk.
                style={{ borderColor: ACCENT_BORDER, color: UI_COLORS.accent }}
              >
                Delete file
              </button>
              <ExportButton fileBytes={fileBytes} fileName={fileName} params={params} />
            </>
          )}
          {/* Drawn 1-bit even in the normal dark interface, on purpose: the
              button is a swatch of the mode it turns on, so it's easy to spot
              and says what it does before you press it.

              The one deliberate exception to the UI_COLORS rule in palette.ts —
              the palette is a set of muted accents and has no true black/white
              pair, which is exactly what this control has to demonstrate.

              Labelled with its destination rather than its state: "1-Bit" takes
              you there, "Colour" brings you back. That's also why there's no
              aria-pressed — the accessible name already says what pressing it
              will do, and a toggle state on top would contradict it.

              Named for the palette, not the era: on a photo editor a button
              called "Retro" reads as something done to the *photograph* (faded
              film, sepia, grain), which is the one thing this mode refuses to
              touch. "Colour" rather than "Modern" for the way back, both
              because it's the true opposite of 1-bit and because the Tone
              mapper dropdown already has a "Modern (AgX)" a few hundred pixels
              away. The store still calls this `retro` — the CSS attribute
              hooks (data-retro, data-retro-chrome, data-retro-desktop) are
              named to match, and renaming them would touch every rule in the
              retro layer for no user-visible gain.

              Outside the file-loaded branch above, and next to full screen: the
              skin is a property of the interface rather than of the open
              photograph, so it sits with the other view controls and stays
              reachable with nothing loaded. */}
          <button
            onClick={toggleRetro}
            title={
              retro
                ? 'Return to the normal colour interface'
                : 'Reskin the whole interface in 1-bit black and white, like a 1984 Macintosh (the photo is left alone)'
            }
            className="h-8 px-2.5 flex items-center justify-center text-xs font-bold leading-none border select-none whitespace-nowrap"
            style={{ backgroundColor: '#fff', color: '#000', borderColor: '#000', borderRadius: 0 }}
          >
            {retro ? 'Colour' : '1-Bit'}
          </button>
          <PanelSideButton className="shrink-0" />
          <FullscreenButton className="shrink-0" />
        </div>
      </header>

      <div className={`flex flex-col flex-1 min-h-0 ${panelSide === 'left' ? 'sm:flex-row-reverse' : 'sm:flex-row'}`}>
        {/* The photo area: only its backdrop is reskinned, never the image. */}
        <main data-retro-desktop className="flex-1 min-w-0 min-h-0 flex flex-col">
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
            <ImageViewer image={preview} params={renderParams} onHistogram={handleHistogram} />
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
