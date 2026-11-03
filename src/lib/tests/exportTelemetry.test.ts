import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ExportAttempt,
  engineLoadFailureCategory,
  exportFailureCategory,
  resetEngineLoadCountForTests,
  startEngineLoad,
  type ExportContext,
} from "../exportTelemetry";
import { HANDLED_ERROR_PREFIX, registerRum, resetTelemetryForTests, sanitizeRumEvent } from "../telemetry";
import { ExportStalledError, FFmpegLoadError } from "../ffmpeg";
import type { DatadogRum } from "@datadog/browser-rum";

const context: ExportContext = {
  format: "mp4",
  resolution: "1080p",
  input_size: "<25MB",
  clip_length: "<15s",
  has_text: false,
  has_music: false,
  has_image_overlay: false,
};

// Every property any of these events may carry. Anything else is a bug.
const ALLOWED_KEYS = new Set([
  ...Object.keys(context),
  "engine",
  "engine_requested",
  "is_retry",
  "retry_after",
  "durationMs",
  "encode_ms",
  "output_size",
  "stage",
  "category",
  "load_number",
  "single_reason",
  "stall_reason",
]);

let rum: { addAction: ReturnType<typeof vi.fn>; addDurationVital: ReturnType<typeof vi.fn> };
const events = () => rum.addAction.mock.calls.map(([name, ctx]) => ({ name: name as string, ctx: ctx as Record<string, unknown> }));
const names = () => events().map((e) => e.name);

beforeEach(() => {
  resetTelemetryForTests();
  resetEngineLoadCountForTests();
  vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "token");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "unit-test");
  rum = { addAction: vi.fn(), addDurationVital: vi.fn() };
  registerRum(rum as unknown as DatadogRum);
});
afterEach(() => vi.unstubAllEnvs());

describe("export attempt outcomes", () => {
  it("reports a success once, with engine, monotonic durations and buckets only", () => {
    const attempt = new ExportAttempt(context);
    attempt.encoding("multi");
    expect(attempt.succeeded("<25MB")).toBe(true);
    expect(attempt.succeeded("<25MB")).toBe(false);
    attempt.failed(new Error("late"));
    attempt.cancelled();

    expect(names()).toEqual(["export_started", "export_succeeded"]);
    const done = events()[1]!.ctx;
    expect(done).toMatchObject({ engine: "multi", is_retry: false, output_size: "<25MB" });
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(done.encode_ms).toBeGreaterThanOrEqual(0);
    expect(rum.addDurationVital).toHaveBeenCalledWith("export", expect.objectContaining({ context: { ...context, engine: "multi" } }));
  });

  it("never reports a user cancellation as a failure", () => {
    const attempt = new ExportAttempt(context);
    attempt.encoding("single");
    expect(attempt.cancelled()).toBe(true);
    // The aborted encode later rejects; it must not become a second outcome.
    expect(attempt.failed(new DOMException("Aborted", "AbortError"))).toBeNull();
    expect(attempt.failed(new Error("ffmpeg exited"))).toBeNull();
    expect(names()).toEqual(["export_started", "export_cancelled"]);
    expect(events()[1]!.ctx).toMatchObject({ stage: "encode", engine: "single" });
  });

  it("treats an AbortError as a cancellation even without cancelled()", () => {
    const attempt = new ExportAttempt(context);
    expect(attempt.failed(new DOMException("Aborted", "AbortError"))).toBeNull();
    expect(names()).toEqual(["export_started", "export_cancelled"]);
    expect(events()[1]!.ctx).toMatchObject({ stage: "engine", engine: "none" });
  });

  it("reports a failure once with a controlled category, never the message", () => {
    const attempt = new ExportAttempt(context);
    attempt.encoding("multi");
    const secret = "/Users/alice/holiday clip.mp4: Invalid data found";
    expect(attempt.failed(new Error(secret))).toBe("encode_error");
    expect(attempt.failed(new Error("again"))).toBeNull();
    expect(names()).toEqual(["export_started", "export_failed"]);
    expect(JSON.stringify(rum.addAction.mock.calls)).not.toContain("alice");
    expect(events()[1]!.ctx).toMatchObject({ stage: "encode", category: "encode_error" });
  });

  it("reports which watchdog rule stopped a stalled export", () => {
    const attempt = new ExportAttempt(context);
    attempt.encoding("multi");
    expect(attempt.failed(new ExportStalledError("multi", "no_progress"))).toBe("timeout");
    expect(events()[1]!.ctx).toMatchObject({ category: "timeout", stall_reason: "no_progress" });
  });

  it("a clip of unknown length that stalls or fails is reported as unknown_duration", () => {
    const unknown = { ...context, clip_length: "unknown" };
    const stalled = new ExportAttempt(unknown);
    stalled.encoding("multi");
    expect(stalled.failed(new ExportStalledError("multi", "overrun"))).toBe("unknown_duration");
    expect(events()[1]!.ctx).toMatchObject({ category: "unknown_duration", stall_reason: "overrun" });

    const failed = new ExportAttempt(unknown);
    failed.encoding("single");
    expect(failed.failed(new Error("ffmpeg exited with code 1"))).toBe("unknown_duration");

    // Failures with a clearer cause keep it, and the engine stage is never this.
    const oom = new ExportAttempt(unknown);
    oom.encoding("single");
    expect(oom.failed(new RangeError("Array buffer allocation failed"))).toBe("out_of_memory");
    expect(new ExportAttempt(unknown).failed(new FFmpegLoadError("Failed to fetch"))).toBe("engine_load");
  });

  it("marks retries, and whether the retry recovered", () => {
    new ExportAttempt(context, "timeout").succeeded("<25MB");
    expect(events()[0]!.ctx).toMatchObject({ is_retry: true, retry_after: "timeout" });
    expect(events()[1]!.ctx).toMatchObject({ is_retry: true });
  });

  it("only ever sends documented, bounded properties", () => {
    const a = new ExportAttempt(context, "engine_load");
    a.encoding("multi");
    a.failed(new Error("x"));
    new ExportAttempt(context).cancelled();
    new ExportAttempt(context).succeeded("25-100MB");
    const load = startEngineLoad("multi");
    load.failed(new Error("Failed to fetch engine file (HTTP 503)"));
    startEngineLoad("single").succeeded("single");

    for (const { name, ctx } of events()) {
      for (const [key, value] of Object.entries(ctx ?? {})) {
        expect(ALLOWED_KEYS.has(key), `${name}.${key}`).toBe(true);
        expect(["string", "number", "boolean"]).toContain(typeof value);
        if (typeof value === "string") expect(value.length).toBeLessThan(24);
      }
    }
  });
});

describe("failure categories", () => {
  it.each([
    [new ExportStalledError("multi"), "encode", "timeout"],
    [new FFmpegLoadError("boom"), "encode", "engine_load"],
    [new Error("anything"), "engine", "engine_load"],
    [new RangeError("Array buffer allocation failed"), "encode", "out_of_memory"],
    [new Error("RuntimeError: memory access out of bounds"), "encode", "encoder_crash"],
    [new Error("Decoder (codec h265) not found"), "encode", "unsupported_format"],
    [new Error("NetworkError when attempting to fetch"), "encode", "network"],
    [new Error("ffmpeg exited with code 1"), "encode", "encode_error"],
    ["not an error", "encode", "encode_error"],
  ] as const)("%s during %s → %s", (err, stage, expected) => {
    expect(exportFailureCategory(err, stage)).toBe(expected);
  });

  it.each([
    [new FFmpegLoadError("Uncaught SyntaxError", "worker_script"), "worker_script"],
    [new FFmpegLoadError("Failed to fetch engine file (HTTP 404)"), "network"],
    [new TypeError("Failed to fetch"), "network"],
    [new FFmpegLoadError("Failed to find a valid digest in the 'integrity' attribute"), "integrity"],
    [new FFmpegLoadError("WebAssembly.instantiate(): Out of memory"), "wasm"],
    [new FFmpegLoadError("something else"), "unknown"],
  ])("engine load %s → %s", (err, expected) => {
    expect(engineLoadFailureCategory(err)).toBe(expected);
  });
});

describe("engine load events", () => {
  it("records why a load ended up single-threaded", () => {
    startEngineLoad("multi").succeeded("multi");
    startEngineLoad("multi").succeeded("single");
    startEngineLoad("single", "not_isolated").succeeded("single");
    startEngineLoad("single", "after_stall").succeeded("single");
    expect(events().map((e) => e.ctx.single_reason ?? null)).toEqual([null, "mt_load_failed", "not_isolated", "after_stall"]);
    expect(events()[1]!.ctx).toMatchObject({ engine: "single", engine_requested: "multi" });
  });

  it("reports one outcome per load and labels later loads as repeats", () => {
    const first = startEngineLoad("multi");
    first.succeeded("multi");
    first.succeeded("multi");
    first.failed(new Error("late"));
    const second = startEngineLoad("single");
    second.failed(new Error("Failed to fetch"));

    expect(names()).toEqual(["ffmpeg_load_success", "ffmpeg_load_failure"]);
    expect(events()[0]!.ctx).toMatchObject({ engine: "multi", load_number: "first" });
    expect(events()[1]!.ctx).toMatchObject({ engine_requested: "single", load_number: "repeat", category: "network" });
    expect(rum.addDurationVital).toHaveBeenCalledTimes(1);
  });

  it("reports nothing for an abandoned (cancelled) load", () => {
    const load = startEngineLoad("multi");
    load.abandoned();
    load.failed(new Error("terminated"));
    expect(names()).toEqual([]);
  });
});

describe("handled errors", () => {
  it("drops RUM's automatic copy of a failure that was already reported", () => {
    const handled = { type: "error", error: { source: "console", message: `${HANDLED_ERROR_PREFIX} export failed: Error` } };
    const unhandled = { type: "error", error: { source: "console", message: "Unhandled application error" } };
    const thrown = { type: "error", error: { source: "source", message: `${HANDLED_ERROR_PREFIX} looks handled` } };
    expect(sanitizeRumEvent(handled)).toBe(false);
    expect(sanitizeRumEvent(unhandled)).toBe(true);
    // Only console copies are dropped; a real exception always reaches RUM.
    expect(sanitizeRumEvent(thrown)).toBe(true);
  });
});
