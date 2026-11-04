// Cache of timeline frames, so a video opened again shows its filmstrip at
// once instead of re-running FFmpeg. Stored in this browser only (IndexedDB),
// keyed by a fingerprint of the file's bytes, never its name, and capped in
// size. "Delete saved data" clears it.

export interface CachedFrame {
  time: number;
  blob: Blob;
}

interface Entry {
  key: string;
  savedAt: number;
  bytes: number;
  frames: CachedFrame[];
}

/** Total size the cache may hold; the least recently used entries go first. */
export const FRAME_CACHE_MAX_BYTES = 20 * 1024 * 1024;

const DB_NAME = "reframe-frames";
const STORE = "frames";

/** Storage the cache runs on; IndexedDB in the app, a fake in tests. */
export interface FrameStore {
  get(key: string): Promise<Entry | undefined>;
  put(entry: Entry): Promise<void>;
  all(): Promise<Pick<Entry, "key" | "savedAt" | "bytes">[]>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Identifies a video by its contents: size, modification time and a SHA-256
 * of its first 64 KB. The same file opened again gets the same key; the name
 * is never used.
 */
export async function fileFingerprint(file: Blob & { lastModified?: number }): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const meta = new TextEncoder().encode(`${file.size}:${file.lastModified ?? 0}:`);
  const data = new Uint8Array(meta.length + head.length);
  data.set(meta);
  data.set(head, meta.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cache key for one filmstrip: the file plus the frame times and width. */
export function frameCacheKey(fingerprint: string, times: number[], width: number): string {
  return `${fingerprint}:${width}:${times.map((t) => t.toFixed(2)).join(",")}`;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await run(db.transaction(STORE, mode).objectStore(STORE));
  } finally {
    db.close();
  }
}

export const indexedDbFrameStore: FrameStore = {
  get: (key) => withStore("readonly", (s) => request(s.get(key) as IDBRequest<Entry | undefined>)),
  put: (entry) => withStore("readwrite", (s) => request(s.put(entry)).then(() => undefined)),
  all: () =>
    withStore("readonly", (s) =>
      request(s.getAll() as IDBRequest<Entry[]>).then((entries) =>
        entries.map(({ key, savedAt, bytes }) => ({ key, savedAt, bytes }))
      )
    ),
  delete: (key) => withStore("readwrite", (s) => request(s.delete(key)).then(() => undefined)),
  clear: () => withStore("readwrite", (s) => request(s.clear()).then(() => undefined)),
};

/** Frames saved for `key`, or null. Marks the entry as recently used. */
export async function getCachedFrames(key: string, store: FrameStore = indexedDbFrameStore): Promise<CachedFrame[] | null> {
  try {
    const entry = await store.get(key);
    if (!entry) return null;
    await store.put({ ...entry, savedAt: Date.now() });
    return entry.frames;
  } catch {
    return null; // storage blocked or broken: just regenerate
  }
}

/** Saves frames for `key`, then evicts the oldest entries beyond the size cap. */
export async function putCachedFrames(
  key: string,
  frames: CachedFrame[],
  store: FrameStore = indexedDbFrameStore,
  maxBytes = FRAME_CACHE_MAX_BYTES
): Promise<void> {
  const bytes = frames.reduce((n, f) => n + f.blob.size, 0);
  if (bytes > maxBytes) return;
  try {
    await store.put({ key, savedAt: Date.now(), bytes, frames });
    const entries = (await store.all()).sort((a, b) => a.savedAt - b.savedAt);
    let total = entries.reduce((n, e) => n + e.bytes, 0);
    for (const entry of entries) {
      if (total <= maxBytes) break;
      if (entry.key === key) continue;
      await store.delete(entry.key);
      total -= entry.bytes;
    }
  } catch {
    // Full or blocked storage: the filmstrip still works, just uncached.
  }
}

/** Removes every cached frame ("Delete saved data"). */
export async function clearFrameCache(store: FrameStore = indexedDbFrameStore): Promise<void> {
  try {
    await store.clear();
  } catch {
    // nothing stored, or storage blocked
  }
}
