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
  Boolean(process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID && process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN) &&
  currentTelemetryEnv() !== null;

// ── Environment ────────────────────────────────────────────────────────────
// Local builds read .env.local, which holds the real Datadog keys. Without a
// guard, `next dev`, local production builds and the perf scripts all
// reported as env:production.

const LOCAL_HOST =
  /^(localhost|.+\.localhost|.+\.local|0\.0\.0\.0|127(\.\d+){3}|\[?::1\]?|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2})$/i;

export interface TelemetryEnvInput {
  /** NEXT_PUBLIC_DATADOG_ENV — explicit override; "off" disables RUM. */
  explicitEnv?: string;
  /** NEXT_PUBLIC_VERCEL_ENV — "production" | "preview" | "development" on Vercel. */
  vercelEnv?: string;
  hostname?: string;
  /** navigator.webdriver — true under Puppeteer, Playwright and Lighthouse CI. */
  webdriver?: boolean;
}

/**
 * The Datadog `env` tag to report under, or null to not start RUM at all.
 * Local hosts and automated browsers never report unless an explicit,
 * non-production env is set (e.g. NEXT_PUBLIC_DATADOG_ENV=local-perf).
 */
export function resolveTelemetryEnv({ explicitEnv, vercelEnv, hostname, webdriver }: TelemetryEnvInput): string | null {
  const explicit = explicitEnv?.trim().toLowerCase() || undefined;
  if (explicit === "off" || explicit === "none" || explicit === "disabled") return null;

  const local = !hostname || LOCAL_HOST.test(hostname) || webdriver === true;
  if (local) {
    if (!explicit || explicit === "production" || explicit === "prod") return null;
    return explicit;
  }
  if (explicit) return explicit;
  if (vercelEnv === "preview" || vercelEnv === "development") return vercelEnv;
  return "production";
}

export function currentTelemetryEnv(): string | null {
  if (typeof window === "undefined") return null;
  return resolveTelemetryEnv({
    explicitEnv: process.env.NEXT_PUBLIC_DATADOG_ENV,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    hostname: window.location?.hostname,
    webdriver: typeof navigator !== "undefined" ? navigator.webdriver : undefined,
  });
}

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
  redactions.clear();
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
  if (err instanceof Error && err.name === "ExportStalledError") return "stalled";
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  const name = err instanceof Error ? err.name : "";
  if (name === "FFmpegLoadError" || msg.includes("engine") || msg.includes("worker")) return "engine";
  // A wasm trap inside an encoder, not the tab running out of memory.
  if (msg.includes("memory access out of bounds") || msg.includes("unreachable") || msg.includes("runtimeerror")) return "crash";
  if (msg.includes("out of memory") || msg.includes("allocation failed") || /\boom\b/.test(msg) || name === "RangeError") return "memory";
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

// ── Scrubbing automatically collected events ──────────────────────────────
// Custom actions above only carry buckets, but the SDK also collects errors
// (including console.error), resources and view URLs on its own. Those can
// contain the uploaded file's name, a local path or the recipe in the query
// string, so they pass through sanitizeRumEvent in DatadogInit's beforeSend.

const MEDIA_EXT = "mp4|m4v|mov|qt|webm|mkv|avi|wmv|flv|3gp|gif|mp3|wav|aac|m4a|ogg|oga|opus|flac|png|jpe?g|webp|avif|heic|bmp|svg|srt|vtt";
const FILE_NAME = new RegExp(`[^\\s"'<>/\\\\:|*?]+\\.(?:${MEDIA_EXT})\\b`, "gi");
const LOCAL_PATH = /(?:[A-Za-z]:\\|\/(?:Users|home|private|var|tmp|mnt|media|Volumes|storage|sdcard|data)\/)[^\s"'<>):]*/g;
const MAX_TEXT = 1000;

const redactions = new Set<string>();
const MAX_REDACTIONS = 200;

/**
 * Registers user-specific strings (file names, captions) to strip from any
 * automatically collected event text. Kept in memory only, never sent.
 */
export function addTelemetryRedaction(...values: (string | null | undefined)[]) {
  for (const value of values) {
    const v = value?.trim();
    if (!v || v.length < 3) continue;
    redactions.add(v);
    const stem = v.replace(/\.[^.]+$/, "");
    if (stem !== v && stem.length >= 3) redactions.add(stem);
  }
  // Captions are registered as they're typed; keep the most recent entries.
  while (redactions.size > MAX_REDACTIONS) {
    redactions.delete(redactions.values().next().value!);
  }
}

export function clearTelemetryRedactions() {
  redactions.clear();
}

function stripUrlQuery(text: string): string {
  return text.replace(/(\b(?:https?|wss?):\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi, "$1");
}

/** Removes file names, local paths, blob/file URLs and query strings from free text. */
export function scrubText(text: string): string {
  let out = text;
  // Longest first so "My clip.mp4" goes before its stem "My clip".
  for (const value of [...redactions].sort((a, b) => b.length - a.length)) {
    out = out.split(value).join("[redacted]");
  }
  out = out
    .replace(/\bblob:[^\s"'<>)]+/gi, "blob:[redacted]")
    .replace(/\bfile:\/\/[^\s"'<>)]+/gi, "file:[redacted]")
    .replace(/\bdata:[^\s"'<>)]{24,}/gi, "data:[redacted]");
  out = stripUrlQuery(out).replace(LOCAL_PATH, "[path]").replace(FILE_NAME, "[file]");
  return out.length > MAX_TEXT ? `${out.slice(0, MAX_TEXT)}…` : out;
}

export function stripQuery(url: string | undefined): string | undefined {
  if (!url) return url;
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

type MutableRumEvent = {
  type?: string;
  view?: { url?: string; referrer?: string; name?: string };
  resource?: { url?: string };
  error?: {
    message?: string;
    stack?: string;
    resource?: { url?: string };
    causes?: { message?: string; stack?: string }[];
  };
  action?: { target?: { name?: string } };
};

/**
 * DatadogInit's beforeSend. Returns false to drop the event. Mutates in
 * place because the SDK only reads back modified fields of the same object.
 */
export function sanitizeRumEvent(event: MutableRumEvent): boolean {
  if (event.view) {
    event.view.url = stripQuery(event.view.url);
    event.view.referrer = stripQuery(event.view.referrer);
    if (event.view.name) event.view.name = scrubText(event.view.name);
  }
  if (event.type === "resource" && event.resource?.url) {
    // Previews and exports are local blob: URLs; never report them.
    if (/^(blob|data|file):/i.test(event.resource.url)) return false;
    event.resource.url = stripQuery(event.resource.url) ?? event.resource.url;
  }
  if (event.error) {
    if (event.error.message) event.error.message = scrubText(event.error.message);
    if (event.error.stack) event.error.stack = scrubText(event.error.stack);
    if (event.error.resource?.url) event.error.resource.url = stripQuery(event.error.resource.url) ?? "";
    event.error.causes?.forEach((cause) => {
      if (cause.message) cause.message = scrubText(cause.message);
      if (cause.stack) cause.stack = scrubText(cause.stack);
    });
  }
  if (event.action?.target?.name) {
    event.action.target.name = scrubText(event.action.target.name);
  }
  return true;
}
