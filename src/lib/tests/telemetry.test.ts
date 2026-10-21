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
  resolveTelemetryEnv,
  currentTelemetryEnv,
  telemetryConfigured,
  scrubText,
  sanitizeRumEvent,
  addTelemetryRedaction,
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
    // jsdom runs on localhost, which is disabled unless an env is explicit.
    vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "unit-test");
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
    expect(failureCategory(new Error("RuntimeError: memory access out of bounds"))).toBe("crash");
    expect(failureCategory(new Error("Aborted(OOM)"))).toBe("memory");
    expect(failureCategory(Object.assign(new Error("x"), { name: "ExportStalledError" }))).toBe("stalled");
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

describe("telemetry environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("never reports local or automated runs as production", () => {
    for (const hostname of ["localhost", "127.0.0.1", "[::1]", "192.168.1.20", "10.0.0.5", "reframe.local", "app.localhost", ""]) {
      expect(resolveTelemetryEnv({ hostname })).toBeNull();
      expect(resolveTelemetryEnv({ hostname, explicitEnv: "production" })).toBeNull();
    }
    expect(resolveTelemetryEnv({ hostname: "reframe-lilac.vercel.app", webdriver: true })).toBeNull();
  });

  it("lets local perf runs opt in under a non-production env", () => {
    expect(resolveTelemetryEnv({ hostname: "localhost", explicitEnv: "local-perf" })).toBe("local-perf");
    expect(resolveTelemetryEnv({ hostname: "localhost", webdriver: true, explicitEnv: "local-perf" })).toBe("local-perf");
  });

  it("tags deployed builds by Vercel environment, defaulting to production", () => {
    expect(resolveTelemetryEnv({ hostname: "reframe-lilac.vercel.app" })).toBe("production");
    expect(resolveTelemetryEnv({ hostname: "reframe-lilac.vercel.app", vercelEnv: "production" })).toBe("production");
    expect(resolveTelemetryEnv({ hostname: "reframe-abc.vercel.app", vercelEnv: "preview" })).toBe("preview");
    expect(resolveTelemetryEnv({ hostname: "example.netlify.app", explicitEnv: "staging" })).toBe("staging");
  });

  it("can be switched off explicitly", () => {
    expect(resolveTelemetryEnv({ hostname: "reframe-lilac.vercel.app", explicitEnv: "off" })).toBeNull();
  });

  it("in this jsdom (localhost) run, RUM stays off without an explicit env", () => {
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "token");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "");
    expect(currentTelemetryEnv()).toBeNull();
    expect(telemetryConfigured()).toBe(false);
    resetTelemetryForTests();
    const rum = fakeRum();
    registerRum(rum);
    trackAction("export_start");
    expect(rum.addAction).not.toHaveBeenCalled();
  });
});

describe("RUM event sanitising", () => {
  beforeEach(() => resetTelemetryForTests());

  it("removes registered file names and captions, including the bare stem", () => {
    addTelemetryRedaction("Family trip 2026.mov", "Happy birthday Sam!");
    const out = scrubText("Failed to restore 'Family trip 2026.mov' (Family trip 2026) caption=Happy birthday Sam!");
    expect(out).not.toMatch(/Family|birthday|Sam/);
  });

  it("removes media file names, local paths, blob/file URLs and query strings it was never told about", () => {
    const out = scrubText(
      "Error at /Users/alex/Movies/secret.mp4 C:\\Users\\alex\\clip.webm blob:https://x.app/1234-abcd " +
        "file:///home/alex/a.mkv https://reframe.app/?brightness=0.4&text=hi#t holiday.MOV"
    );
    expect(out).not.toMatch(/alex|secret|clip\.webm|1234-abcd|brightness|holiday/i);
    expect(out).toContain("https://reframe.app/");
  });

  it("keeps ordinary stack frames readable", () => {
    const frame = "at exportVideo (https://reframe.app/_next/static/chunks/123-abc.js:1:2345)";
    expect(scrubText(frame)).toBe(frame);
  });

  it("caps long messages", () => {
    expect(scrubText("x".repeat(5000)).length).toBeLessThanOrEqual(1001);
  });

  it("sanitises views, resources, errors and action names, and drops blob resources", () => {
    addTelemetryRedaction("wedding.mp4");
    const view = { type: "view", view: { url: "https://reframe.app/?contrast=1.2", referrer: "https://ref.example/?q=1" } };
    expect(sanitizeRumEvent(view)).toBe(true);
    expect(view.view).toEqual({ url: "https://reframe.app/", referrer: "https://ref.example/" });

    expect(sanitizeRumEvent({ type: "resource", resource: { url: "blob:https://reframe.app/abc" } })).toBe(false);
    const resource = { type: "resource", resource: { url: "https://cdn.jsdelivr.net/core.wasm?v=1" } };
    sanitizeRumEvent(resource);
    expect(resource.resource.url).toBe("https://cdn.jsdelivr.net/core.wasm");

    const error = {
      type: "error",
      error: {
        message: "console error: Failed to restore video session: wedding.mp4",
        stack: "Error: wedding.mp4\n at x (https://reframe.app/_next/static/chunks/a.js:1:1)",
        resource: { url: "https://reframe.app/?speed=2" },
        causes: [{ message: "nested wedding.mp4", stack: "" }],
      },
    };
    sanitizeRumEvent(error);
    expect(JSON.stringify(error)).not.toMatch(/wedding|speed=2/);

    const action = { type: "action", action: { target: { name: "Remove wedding.mp4" } } };
    sanitizeRumEvent(action);
    expect(action.action.target.name).not.toContain("wedding");
  });
});
