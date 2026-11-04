import { describe, it, expect } from "vitest";
import {
  clearFrameCache,
  fileFingerprint,
  frameCacheKey,
  getCachedFrames,
  putCachedFrames,
  type FrameStore,
} from "../frameCache";

type Entry = Parameters<FrameStore["put"]>[0];

function memoryStore() {
  const entries = new Map<string, Entry>();
  const store: FrameStore = {
    get: async (key) => entries.get(key),
    put: async (entry) => void entries.set(entry.key, entry),
    all: async () => [...entries.values()].map(({ key, savedAt, bytes }) => ({ key, savedAt, bytes })),
    delete: async (key) => void entries.delete(key),
    clear: async () => entries.clear(),
  };
  return { store, entries };
}

const frames = (n: number, size: number) => Array.from({ length: n }, (_, i) => ({ time: i, blob: new Blob([new Uint8Array(size)]) }));

describe("fileFingerprint", () => {
  it("depends on the bytes, not the name", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const a = await fileFingerprint(new File([bytes], "a.mp4", { lastModified: 1 }));
    const b = await fileFingerprint(new File([bytes], "renamed.mp4", { lastModified: 1 }));
    const c = await fileFingerprint(new File([new Uint8Array([1, 2, 4])], "a.mp4", { lastModified: 1 }));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });
});

describe("frame cache", () => {
  it("keys include the frame times and width", () => {
    expect(frameCacheKey("fp", [0, 1.5], 160)).toBe("fp:160:0.00,1.50");
    expect(frameCacheKey("fp", [0, 1.5], 160)).not.toBe(frameCacheKey("fp", [0, 2], 160));
  });

  it("round-trips frames and misses unknown keys", async () => {
    const { store } = memoryStore();
    expect(await getCachedFrames("k", store)).toBeNull();
    await putCachedFrames("k", frames(2, 10), store);
    expect((await getCachedFrames("k", store))?.map((f) => f.time)).toEqual([0, 1]);
  });

  it("evicts the least recently used entries beyond the size cap", async () => {
    const { store, entries } = memoryStore();
    await putCachedFrames("old", frames(1, 40), store, 100);
    await new Promise((r) => setTimeout(r, 2));
    await putCachedFrames("used", frames(1, 40), store, 100);
    await new Promise((r) => setTimeout(r, 2));
    await getCachedFrames("old", store); // touched: now newer than "used"
    await new Promise((r) => setTimeout(r, 2));
    await putCachedFrames("new", frames(1, 40), store, 100);
    expect([...entries.keys()].sort()).toEqual(["new", "old"]);
  });

  it("never stores a strip bigger than the cap", async () => {
    const { store, entries } = memoryStore();
    await putCachedFrames("big", frames(1, 200), store, 100);
    expect(entries.size).toBe(0);
  });

  it("broken storage just means no cache", async () => {
    const broken: FrameStore = {
      get: async () => Promise.reject(new Error("blocked")),
      put: async () => Promise.reject(new Error("blocked")),
      all: async () => Promise.reject(new Error("blocked")),
      delete: async () => Promise.reject(new Error("blocked")),
      clear: async () => Promise.reject(new Error("blocked")),
    };
    await expect(getCachedFrames("k", broken)).resolves.toBeNull();
    await expect(putCachedFrames("k", frames(1, 1), broken)).resolves.toBeUndefined();
    await expect(clearFrameCache(broken)).resolves.toBeUndefined();
  });

  it("clear removes everything", async () => {
    const { store, entries } = memoryStore();
    await putCachedFrames("k", frames(1, 1), store);
    await clearFrameCache(store);
    expect(entries.size).toBe(0);
  });
});
