/**
 * Keyword tags, stored locally in IndexedDB.
 *
 * Tags are keyed by file name rather than by any per-session id, so re-opening
 * the same folder tomorrow brings its keywords back with it — the File objects
 * a browser hands out don't survive a reload, but their names do.
 *
 * This never touches the RAW files themselves. They stay byte-for-byte the
 * originals; keywords live only in this browser.
 */

import { KEYWORD_STORE, openDb, withStore } from './idb';

/** Trimmed, collapsed, lower-cased — so "Sunset", "sunset " and "SUNSET" are
 *  one tag rather than three near-duplicates cluttering the filter list. */
export function normalizeKeyword(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function loadAllKeywords(): Promise<Record<string, string[]>> {
  try {
    const db = await openDb();
    try {
      return await new Promise<Record<string, string[]>>((resolve, reject) => {
        const tx = db.transaction(KEYWORD_STORE, 'readonly');
        const os = tx.objectStore(KEYWORD_STORE);
        const out: Record<string, string[]> = {};
        // openCursor rather than getAll()+getAllKeys(): one pass, and it keeps
        // key and value together so they can't drift out of step.
        const req = os.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          if (Array.isArray(cursor.value)) out[String(cursor.key)] = cursor.value as string[];
          cursor.continue();
        };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return {};
  }
}

/** One file's keywords, read straight from storage. Export uses this instead
 *  of the in-memory library map because that map is only hydrated once the
 *  Files tab has been opened — a file tagged in an earlier session and then
 *  restored straight into the editor would otherwise export with no tags. */
export async function loadKeywordsFor(fileName: string): Promise<string[]> {
  try {
    const value = await withStore<string[]>(KEYWORD_STORE, 'readonly', (os) => os.get(fileName));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveKeywords(fileName: string, keywords: string[]): Promise<void> {
  try {
    // An empty list is a deletion, not an empty row — otherwise clearing a
    // file's tags would leave dead keys accumulating in the store forever.
    if (keywords.length === 0) {
      await withStore(KEYWORD_STORE, 'readwrite', (os) => os.delete(fileName));
    } else {
      await withStore(KEYWORD_STORE, 'readwrite', (os) => os.put(keywords, fileName));
    }
  } catch {
    // ignore — tagging is best-effort, never blocks editing
  }
}
