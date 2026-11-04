import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveDuration } from "../mediaDuration";

/** A video element whose duration becomes known once it is seeked to `revealAt`. */
function fakeVideo(initial: number, reveal?: { duration: number; on: "durationchange" | "seeked" }) {
  const target = new EventTarget() as EventTarget & { duration: number; currentTime: number };
  let duration = initial;
  let time = 0;
  Object.defineProperty(target, "duration", { get: () => duration });
  Object.defineProperty(target, "currentTime", {
    get: () => time,
    set(value: number) {
      time = value;
      if (reveal && value > 1e6) {
        queueMicrotask(() => {
          duration = reveal.duration;
          target.dispatchEvent(new Event(reveal.on));
        });
      }
    },
  });
  return target as unknown as HTMLVideoElement;
}

afterEach(() => vi.useRealTimers());

describe("resolveDuration", () => {
  it("returns a known duration straight away", async () => {
    await expect(resolveDuration(fakeVideo(12.5))).resolves.toBe(12.5);
  });

  it("finds the real length of a live recording (Infinity) by seeking past the end", async () => {
    const video = fakeVideo(Infinity, { duration: 6, on: "durationchange" });
    await expect(resolveDuration(video)).resolves.toBe(6);
    expect(video.currentTime).toBe(0);
  });

  it("also accepts the length reported on seeked", async () => {
    await expect(resolveDuration(fakeVideo(Infinity, { duration: 9, on: "seeked" }))).resolves.toBe(9);
  });

  it("gives up with 0 when the browser never finds it", async () => {
    vi.useFakeTimers();
    const pending = resolveDuration(fakeVideo(Infinity), 4000);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(pending).resolves.toBe(0);
  });

  it("treats NaN and non-positive durations as unknown", async () => {
    await expect(resolveDuration(fakeVideo(NaN))).resolves.toBe(0);
    await expect(resolveDuration(fakeVideo(0))).resolves.toBe(0);
  });
});
