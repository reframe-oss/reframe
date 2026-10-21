import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackAction,
  trackDuration,
  registerRum,
  resetTelemetryForTests,
  sizeBucket,
  durationBucket,
  resolutionBucket,
  failureCategory,
  capabilityContext,
} from "../telemetry";
import type { DatadogRum } from "@datadog/browser-rum";

function fakeRum() {
  return {
    addAction: vi.fn(),
    addTiming: vi.fn(),
    addDurationVital: vi.fn(),
  } as unknown as DatadogRum & {
    addAction: ReturnType<typeof vi.fn>;
    addDurationVital: ReturnType<typeof vi.fn>;
  };
}

describe("telemetry", () => {
  beforeEach(() => {
    resetTelemetryForTests();
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "token");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("queues events until the lazily-loaded SDK registers, then replays them in order", () => {
    trackAction("export_start", { format: "mp4" });
    trackAction("export_success");
    const rum = fakeRum();
    registerRum(rum);
    expect(rum.addAction.mock.calls.map((c) => c[0])).toEqual(["export_start", "export_success"]);
    trackAction("export_cancel");
    expect(rum.addAction).toHaveBeenLastCalledWith("export_cancel", undefined);
  });

  it("is a no-op when RUM isn't configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "");
    const rum = fakeRum();
    registerRum(rum);
    trackAction("export_start");
    expect(rum.addAction).not.toHaveBeenCalled();
  });

  it("never throws into the editor when the SDK fails", () => {
    const rum = fakeRum();
    rum.addAction.mockImplementation(() => {
      throw new Error("sdk broke");
    });
    registerRum(rum);
    expect(() => trackAction("export_start")).not.toThrow();
  });

  it("records durations as both an action and a duration vital", () => {
    const rum = fakeRum();
    registerRum(rum);
    trackDuration("export", performance.now() - 1500, { format: "webm" });
    expect(rum.addAction).toHaveBeenCalledWith("export", expect.objectContaining({ format: "webm", durationMs: expect.any(Number) }));
    expect(rum.addDurationVital).toHaveBeenCalledWith("export", expect.objectContaining({ duration: expect.any(Number) }));
    const ms = rum.addAction.mock.calls[0]![1].durationMs;
    expect(ms).toBeGreaterThanOrEqual(1500);
  });

  it("buckets values so no exact sizes, lengths or messages are sent", () => {
    expect(sizeBucket(10 * 1024 * 1024)).toBe("<25MB");
    expect(sizeBucket(3 * 1024 ** 3)).toBe(">1GB");
    expect(durationBucket(42)).toBe("15-60s");
    expect(durationBucket(NaN)).toBe("unknown");
    expect(resolutionBucket(1080, 1920)).toBe("1080p");
    expect(failureCategory(new Error("Failed to fetch core"))).toBe("network");
    expect(failureCategory(new DOMException("x", "AbortError"))).toBe("cancelled");
    expect(failureCategory(new Error("/Users/me/secret-video.mp4: Invalid data"))).toBe("ffmpeg");
  });

  it("capability context contains only coarse, non-identifying values", () => {
    const ctx = capabilityContext();
    for (const value of Object.values(ctx)) {
      expect(["string", "boolean"]).toContain(typeof value);
    }
    expect(Object.keys(ctx).sort()).toEqual(
      ["cpu_cores", "cross_origin_isolated", "device_memory_gb", "reduced_motion", "shared_array_buffer"].sort()
    );
  });
});
