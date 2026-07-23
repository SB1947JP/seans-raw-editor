import { useState } from 'react';
import { decodeFull } from '../lib/rawDecoder';
import { RawRenderer } from '../gl/renderer';
import { ACCENT_BORDER, UI_COLORS } from '../lib/palette';
import { loadKeywordsFor } from '../lib/keywordStore';
import { embedKeywords } from '../lib/jpegMetadata';
import { EXPORT_MAX_EDGE, useUiMode } from '../state/uiMode';
import { EditParams } from '../types';

interface Props {
  fileBytes: Uint8Array<ArrayBuffer>;
  fileName: string;
  params: EditParams;
}

// Desktop Chromium browsers (Vivaldi, Chrome, Edge, …) also implement
// navigator.share/canShare for files, so gating on feature-detection alone
// routes them to the mobile-style share sheet instead of their normal
// download flow. The share sheet is only actually needed on iOS/iPadOS,
// where blob-URL anchor downloads don't reliably save anywhere — so detect
// that platform specifically rather than just checking API availability.
// iPadOS reports as "MacIntel" but exposes touch points, unlike a real Mac.
function isIOS(): boolean {
  return /iP(hone|od|ad)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// File System Access API — Chromium only, and not in TypeScript's DOM lib.
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface WritableTarget {
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}
type SaveFilePicker = (options: SaveFilePickerOptions) => Promise<WritableTarget>;

function getSaveFilePicker(): SaveFilePicker | null {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  return typeof picker === 'function' ? picker : null;
}

export function ExportButton({ fileBytes, fileName, params }: Props) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportSize = useUiMode((s) => s.exportSize);
  const setExportSize = useUiMode((s) => s.setExportSize);

  const handleExport = async () => {
    setError(null);
    const outName = `${fileName.replace(/\.[^.]+$/, '')}_edited.jpg`;

    // Ask where to save *before* decoding, not after.
    //
    // A full-res decode of a large RAW takes ~13s, which is far longer than
    // the browser's transient user-activation window (~5s in Chromium). Once
    // that window closes the tab no longer counts as "user-initiated", so the
    // anchor download below stops being treated as a real download: Chromium
    // reclassifies it as an automatic one and skips the "choose location"
    // prompt entirely. It degraded gradually rather than breaking, because
    // whether it worked depended purely on how long the decode happened to
    // take. (Same root cause as the iOS share failure documented below.)
    //
    // Opening the save picker synchronously in the click handler spends the
    // activation while it is still valid, so the destination is chosen up
    // front and the decoded bytes are written straight to that handle.
    let saveTarget: WritableTarget | null = null;
    const picker = getSaveFilePicker();
    if (picker && !isIOS()) {
      try {
        saveTarget = await picker({
          suggestedName: outName,
          types: [{ description: 'JPEG image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }],
        });
      } catch (pickErr) {
        // Cancelling the picker means "don't export", not "export somewhere
        // else" — bail out silently rather than dumping a file in Downloads.
        if (pickErr instanceof Error && pickErr.name === 'AbortError') return;
        // Anything else (policy-blocked, unsupported context) just falls
        // through to the anchor path below.
        saveTarget = null;
      }
    }

    setExporting(true);
    try {
      const { image } = await decodeFull(fileBytes);
      const canvas = document.createElement('canvas');
      const renderer = new RawRenderer(canvas);
      renderer.setImage(image);
      renderer.render(params);
      // Downscale to the chosen tier's longer-edge cap (full res for High).
      // Quality stays at 0.92 across tiers — the tiers are a pixel-size choice.
      const rendered = await renderer.toBlobAtSize(EXPORT_MAX_EDGE[exportSize], 'image/jpeg', 0.92);
      renderer.dispose();
      if (!rendered) throw new Error('Export failed');

      // Carry the file's keyword tags into the JPEG so they travel with the
      // picture. Read from storage, not the in-memory library map, so tags set
      // in an earlier session export even when the Files tab was never opened
      // this time. embedKeywords returns the bytes untouched when there are none.
      const keywords = await loadKeywordsFor(fileName);
      const bytes = embedKeywords(new Uint8Array(await rendered.arrayBuffer()), keywords);
      const blob = new Blob([bytes], { type: 'image/jpeg' });

      // Destination already chosen above — write straight to it.
      if (saveTarget) {
        const writable = await saveTarget.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      }

      const file = new File([blob], outName, { type: 'image/jpeg' });

      // iOS/iPadOS Safari doesn't reliably trigger a file-save dialog for
      // anchor[download] with blob URLs — it just opens the image in-place
      // with no way to pick a destination. The Web Share API instead opens
      // the native share sheet, which includes "Save to Files"/"Save Image".
      if (isIOS() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: outName });
          return;
        } catch (shareErr) {
          if (shareErr instanceof Error && shareErr.name === 'AbortError') return;
          // Safari only allows share() while still inside the click's "user
          // activation" window, which the awaited decode/render above has
          // already used up by the time we get here — it rejects with
          // NotAllowedError rather than actually prompting. There's no way
          // to keep activation alive across an async decode, so just fall
          // through to the anchor-download path below instead of failing.
          if (!(shareErr instanceof Error && shareErr.name === 'NotAllowedError')) throw shareErr;
        }
      }

      // Fallback for browsers without the save picker (Safari, Firefox).
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      // In the document and revoked later, not immediately: revoking straight
      // after click() can pull the blob out from under a download the browser
      // hasn't started reading yet, which silently produces no file at all.
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      {/* The action and its size picker are one split control, sharing a single
          accent border with a seam between them, so it reads as "export, at this
          size" rather than a stray dropdown parked next to a button. The size
          tiers are pixel dimensions (longer-edge cap), not JPEG quality — that
          stays fixed. */}
      <div className="flex items-center">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="h-8 px-2.5 flex items-center justify-center text-xs rounded-l border font-medium disabled:opacity-50 hover:bg-neutral-900 whitespace-nowrap"
          style={{ borderColor: ACCENT_BORDER, color: UI_COLORS.accent }}
        >
          {exporting ? 'Exporting…' : 'Export JPEG'}
        </button>
        <select
          value={exportSize}
          onChange={(e) => setExportSize(e.target.value as typeof exportSize)}
          disabled={exporting}
          title="Export size — downscales the saved JPEG by its longer edge"
          aria-label="Export size"
          className="h-8 pl-2 pr-1 text-xs rounded-r border border-l-0 bg-transparent text-neutral-300 disabled:opacity-50"
          style={{ borderColor: ACCENT_BORDER }}
        >
          <option value="high">High · full</option>
          <option value="medium">Medium · 2048px</option>
          <option value="low">Low · 1024px</option>
        </select>
      </div>
    </div>
  );
}
