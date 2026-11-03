import { describe, it, expect, vi } from "vitest";
import {
  computeThumbnailTimes,
  generateThumbnails,
  pickThumbnailInterval,
  MAX_THUMBNAILS,
} from "../thumbnails";

/**
 * Minimal stand-in for an HTMLVideoElement: fires loadeddata after load(),
 * and seeked after currentTime is set — unless that time is in `stallAt`.
 */
class FakeVideo extends EventTarget {
  muted = false;
  preload = "";
  playsInline = false;
  src = "";
  removedSrc = false;
  seeks: number[] = [];
  constructor(private opts: { stallAt?: number[]; failLoad?: boolean } = {}) {
    super();
  }
  load() {
    if (!this.src) return;
    setTimeout(() => this.dispatchEvent(new Event(this.opts.failLoad ? "error" : "loadeddata")), 0);
  }
  removeAttribute(name: string) {
    if (name === "src") {
      this.src = "";
      this.removedSrc = true;
    }
  }
  set currentTime(t: number) {
    this.seeks.push(t);
    if (this.opts.stallAt?.includes(t)) return;
    setTimeout(() => this.dispatchEvent(new Event("seeked")), 0);
  }
}

function harness(videoOpts?: ConstructorParameters<typeof FakeVideo>[0]) {
  const video = new FakeVideo(videoOpts);
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(["x"], { type: "image/jpeg" })),
  };
  let n = 0;
  const created: string[] = [];
  const revoked: string[] = [];
  const createElement = ((tag: string) => (tag === "video" ? video : canvas)) as unknown as typeof document.createElement;
  return {
    video,
    created,
    revoked,
    opts: {
      createElement,
      createObjectURL: () => {
        const url = `blob:thumb-${++n}`;
        created.push(url);
        return url;
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    },
  };
}

describe("computeThumbnailTimes", () => {
  it("returns nothing for an unknown or zero duration", () => {
    expect(computeThumbnailTimes(0, 2)).toEqual([]);
    expect(computeThumbnailTimes(NaN, 2)).toEqual([]);
  });

  it("samples at the interval and adds a frame near the end", () => {
    const times = computeThumbnailTimes(10, 2);
    expect(times[0]).toBe(0);
    expect(times).toContain(8);
    expect(times[times.length - 1]).toBeCloseTo(9.9);
  });

  it("caps the count for long videos by widening the interval", () => {
    const times = computeThumbnailTimes(3 * 60 * 60, 30); // 3 hours
    expect(times.length).toBeLessThanOrEqual(MAX_THUMBNAILS);
    expect(times.length).toBeGreaterThan(MAX_THUMBNAILS - 2);
  });

  it("never produces two thumbnails within the same second", () => {
    const times = computeThumbnailTimes(1.5, 0.2);
    const seconds = times.map((t) => Math.floor(t));
    expect(new Set(seconds).size).toBe(seconds.length);
  });

  it("scales the interval with duration", () => {
    expect(pickThumbnailInterval(20)).toBe(2);
    expect(pickThumbnailInterval(600)).toBe(30);
  });
});

describe("generateThumbnails", () => {
  it("captures every frame, reports batches, and releases the decoder", async () => {
    const h = harness();
    const onBatch = vi.fn();
    const { frames, skipped } = await generateThumbnails("blob:src", [0, 2, 4, 6, 8], {
      ...h.opts,
      batchSize: 2,
      onBatch,
    });
    expect(frames.map((f) => f.time)).toEqual([0, 2, 4, 6, 8]);
    expect(skipped).toBe(0);
    // batches at 2, 4 and the final 5 — not one React update per frame
    expect(onBatch).toHaveBeenCalledTimes(3);
    expect(h.video.removedSrc).toBe(true);
    expect(h.revoked).toEqual([]);
  });

  it("seeks sequentially, one position at a time", async () => {
    const h = harness();
    await generateThumbnails("blob:src", [0, 1, 2], h.opts);
    expect(h.video.seeks).toEqual([0, 1, 2]);
  });

  it("skips a position whose seek never completes instead of hanging", async () => {
    const h = harness({ stallAt: [2] });
    const { frames, skipped } = await generateThumbnails("blob:src", [0, 2, 4], {
      ...h.opts,
      seekTimeoutMs: 20,
    });
    expect(frames.map((f) => f.time)).toEqual([0, 4]);
    expect(skipped).toBe(1);
  });

  it("aborting stops further seeks and revokes every URL it created", async () => {
    const h = harness();
    const controller = new AbortController();
    const promise = generateThumbnails("blob:src", [0, 1, 2, 3, 4, 5], {
      ...h.opts,
      signal: controller.signal,
      batchSize: 1,
      onBatch: (frames) => {
        if (frames.length === 2) controller.abort();
      },
    });
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(h.video.seeks.length).toBeLessThan(6);
    expect(h.created.length).toBeGreaterThan(0);
    expect(new Set(h.revoked)).toEqual(new Set(h.created));
    expect(h.video.removedSrc).toBe(true);
  });

  it("rejects (and cleans up) when the video can't be decoded", async () => {
    const h = harness({ failLoad: true });
    await expect(generateThumbnails("blob:src", [0, 1], h.opts)).rejects.toThrow(/decoded/);
    expect(h.video.removedSrc).toBe(true);
    expect(h.created).toEqual([]);
  });
});
