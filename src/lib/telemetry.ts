import type { DatadogRum as RumPublicApi } from "@datadog/browser-rum";

// Custom Datadog RUM actions. Only coarse, non-identifying metrics are sent —
// never file names, contents, captions or recipe values (Reframe is
// privacy-first). No-op when RUM isn't configured (see DatadogInit).
//
// Event names (keep this list and docs/PERFORMANCE.md in sync):
//   ffmpeg_load_success / ffmpeg_load_failure   — engine init (durationMs, threading)
//   export_start / export_success / export_failure / export_cancel
//                                               — durationMs, format, resolution, size buckets
//   thumbnails_generated / thumbnails_failed    — frame-strip extraction
// Duration vitals (visible under RUM → Vitals): ffmpeg_init, export, thumbnails_generated.
//
// The SDK is loaded lazily by DatadogInit (it is not needed for first paint).
// Calls made before it registers are queued (bounded) and replayed.
export const telemetryConfigured = () =>
  typeof window !== "undefined" &&
  Boolean(process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID && process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN);

export type TelemetryContext = Record<string, string | number | boolean>;

type RumCall = (rum: RumPublicApi) => void;
const MAX_QUEUED = 50;
let rum: RumPublicApi | null = null;
let queue: RumCall[] = [];

function run(call: RumCall) {
  if (!telemetryConfigured()) return;
  if (!rum) {
    if (queue.length < MAX_QUEUED) queue.push(call);
    return;
  }
  try {
    call(rum);
  } catch {
    // Telemetry must never break the editor.
  }
}

/** Called once by DatadogInit after the SDK is initialised. */
export function registerRum(instance: RumPublicApi) {
  rum = instance;
  const pending = queue;
  queue = [];
  pending.forEach(run);
}

/** Test helper: forget the registered SDK and queued calls. */
export function resetTelemetryForTests() {
  rum = null;
  queue = [];
}

export function trackAction(name: string, context?: TelemetryContext) {
  run((r) => r.addAction(name, context));
}

export function trackTiming(name: string) {
  // addTiming is relative to the current view; capture the time now, not at replay.
  const time = typeof performance !== "undefined" ? Math.round(performance.now()) : undefined;
  run((r) => r.addTiming(name, time));
}

/**
 * Records a duration both as a RUM duration vital (for percentiles in
 * Datadog) and as an action carrying `durationMs` (for event search).
 * `startedAt` is a `performance.now()` timestamp.
 */
export function trackDuration(name: string, startedAt: number, context?: TelemetryContext) {
  const durationMs = Math.round(performance.now() - startedAt);
  trackAction(name, { ...context, durationMs });
  const startTime = Math.round(performance.timeOrigin + startedAt);
  run((r) => r.addDurationVital(name, { startTime, duration: durationMs, context }));
}

// ── Low-cardinality buckets ────────────────────────────────────────────────
// Raw sizes/durations are identifying in aggregate and explode cardinality,
// so only coarse ranges are reported.

export function sizeBucket(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 25) return "<25MB";
  if (mb < 100) return "25-100MB";
  if (mb < 500) return "100-500MB";
  if (mb < 1024) return "500MB-1GB";
  return ">1GB";
}

export function durationBucket(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  if (seconds < 15) return "<15s";
  if (seconds < 60) return "15-60s";
  if (seconds < 300) return "1-5min";
  if (seconds < 1200) return "5-20min";
  return ">20min";
}

export function resolutionBucket(width: number, height: number): string {
  const p = Math.min(width, height);
  if (p <= 480) return "<=480p";
  if (p <= 720) return "720p";
  if (p <= 1080) return "1080p";
  if (p <= 1440) return "1440p";
  return "2160p+";
}

/** Maps an export error to a small fixed set of categories (never the raw message). */
export function failureCategory(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  const name = err instanceof Error ? err.name : "";
  if (name === "FFmpegLoadError" || msg.includes("engine") || msg.includes("worker")) return "engine";
  if (msg.includes("memory") || msg.includes("out of bounds") || name === "RangeError") return "memory";
  if (msg.includes("network") || msg.includes("fetch")) return "network";
  if (msg.includes("codec") || msg.includes("decod")) return "codec";
  return "ffmpeg";
}

/**
 * Coarse device/browser capabilities, attached once as RUM global context so
 * every event can be sliced by them. All values are bucketed booleans/ranges.
 */
export function capabilityContext(): TelemetryContext {
  if (typeof window === "undefined") return {};
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 0;
  return {
    cross_origin_isolated: Boolean(window.crossOriginIsolated),
    shared_array_buffer: typeof SharedArrayBuffer !== "undefined",
    cpu_cores: cores >= 8 ? "8+" : cores >= 4 ? "4-7" : cores > 0 ? "1-3" : "unknown",
    device_memory_gb: nav.deviceMemory ? (nav.deviceMemory >= 8 ? "8+" : String(nav.deviceMemory)) : "unknown",
    reduced_motion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  };
}
