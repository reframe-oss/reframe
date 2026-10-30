/**
 * Export and engine-load telemetry with fixed semantics:
 *   - every export_started is followed by at most one terminal event
 *     (export_succeeded, export_failed or export_cancelled);
 *   - a user cancellation is never an export_failed;
 *   - failures carry one category from a closed list, never the raw message.
 * Event names and properties are documented in docs/DATADOG.md.
 */
import { failureCategory, trackAction, trackVital } from "./telemetry";

/** Which FFmpeg core the worker loaded. */
export type EngineMode = "multi" | "single";

export type ExportStage = "engine" | "encode";

export type ExportFailureCategory =
  | "engine_load"
  | "timeout"
  | "unsupported_format"
  | "out_of_memory"
  | "encoder_crash"
  | "network"
  | "encode_error";

export type EngineLoadFailureCategory = "network" | "integrity" | "wasm" | "worker_script" | "unknown";

/** Why a load ended up single-threaded. */
export type SingleThreadReason = "not_isolated" | "after_stall" | "mt_load_failed";

/** Bounded, non-identifying description of an export. */
export interface ExportContext {
  format: string;
  resolution: string;
  input_size: string;
  clip_length: string;
  has_text: boolean;
  has_music: boolean;
  has_image_overlay: boolean;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const isAbort = (err: unknown) =>
  (err instanceof DOMException || err instanceof Error) && err.name === "AbortError";

export function exportFailureCategory(err: unknown, stage: ExportStage): ExportFailureCategory {
  const name = err instanceof Error ? err.name : "";
  if (name === "ExportStalledError") return "timeout";
  if (stage === "engine" || name === "FFmpegLoadError") return "engine_load";
  switch (failureCategory(err)) {
    case "memory":
      return "out_of_memory";
    case "crash":
      return "encoder_crash";
    case "codec":
      return "unsupported_format";
    case "network":
      return "network";
    default:
      return "encode_error";
  }
}

/**
 * Classifies an engine start-up failure from Reframe's own error text (the
 * worker's messages, never user input). `source` is set by the caller when it
 * knows more, e.g. the worker script itself failed to load.
 */
export function engineLoadFailureCategory(err: unknown): EngineLoadFailureCategory {
  const source = (err as { source?: unknown } | null)?.source;
  if (source === "worker_script") return "worker_script";
  const msg = err instanceof Error ? `${err.name} ${err.message}`.toLowerCase() : String(err ?? "").toLowerCase();
  if (/integrity|digest|\bsri\b/.test(msg)) return "integrity";
  if (/webassembly|compileerror|linkerror|\bwasm\b|instantiate/.test(msg)) return "wasm";
  if (/fetch|network|http \d{3}|load failed/.test(msg)) return "network";
  if (/syntaxerror|importscripts|\bworker\b/.test(msg)) return "worker_script";
  return "unknown";
}

type Outcome = "succeeded" | "failed" | "cancelled";

/** One export attempt, from the Export click to its single outcome. */
export class ExportAttempt {
  stage: ExportStage = "engine";
  private outcome: Outcome | null = null;
  private readonly startedAt = now();
  private encodeStartedAt: number | null = null;
  private engine: EngineMode | "none" = "none";

  constructor(
    private readonly context: ExportContext,
    private readonly retryOf: ExportFailureCategory | null = null
  ) {
    trackAction("export_started", {
      ...context,
      is_retry: retryOf !== null,
      ...(retryOf ? { retry_after: retryOf } : {}),
    });
  }

  get settled(): boolean {
    return this.outcome !== null;
  }

  /** The engine is ready and encoding begins. */
  encoding(engine: EngineMode | null): void {
    this.stage = "encode";
    this.engine = engine ?? "single";
    this.encodeStartedAt = now();
  }

  private common() {
    return {
      ...this.context,
      engine: this.engine,
      is_retry: this.retryOf !== null,
      durationMs: Math.round(now() - this.startedAt),
    };
  }

  /** Returns false if this attempt already had an outcome. */
  succeeded(outputSize: string): boolean {
    if (this.settled) return false;
    this.outcome = "succeeded";
    const encodeStartedAt = this.encodeStartedAt ?? this.startedAt;
    // The duration vital measures encoding only; engine start-up is ffmpeg_init.
    trackVital("export", encodeStartedAt, { ...this.context, engine: this.engine });
    trackAction("export_succeeded", {
      ...this.common(),
      encode_ms: Math.round(now() - encodeStartedAt),
      output_size: outputSize,
    });
    return true;
  }

  /**
   * Records a failure, or a cancellation if `err` is an AbortError. Returns
   * the category, or null if this attempt already had an outcome.
   */
  failed(err: unknown): ExportFailureCategory | null {
    if (this.settled) return null;
    if (isAbort(err)) {
      this.cancelled();
      return null;
    }
    this.outcome = "failed";
    const category = exportFailureCategory(err, this.stage);
    trackAction("export_failed", { ...this.common(), stage: this.stage, category });
    return category;
  }

  /** Returns false if this attempt already had an outcome. */
  cancelled(): boolean {
    if (this.settled) return false;
    this.outcome = "cancelled";
    trackAction("export_cancelled", { ...this.common(), stage: this.stage });
    return true;
  }
}

// ── Engine start-up ──────────────────────────────────────────────────────────

let loadsThisPage = 0;

/**
 * One engine load (one worker). Reports exactly one of ffmpeg_load_success or
 * ffmpeg_load_failure, or nothing if the load was abandoned (a cancellation,
 * which the export attempt reports).
 */
export function startEngineLoad(requested: EngineMode, singleReason: SingleThreadReason | null = null) {
  const startedAt = now();
  // "repeat" loads usually reuse the HTTP-cached core: a different cost profile.
  const load_number = loadsThisPage++ === 0 ? "first" : "repeat";
  let done = false;
  return {
    succeeded(engine: EngineMode) {
      if (done) return;
      done = true;
      // The worker falls back to the single-threaded core by itself when the
      // multi-threaded one fails to load.
      const reason = engine === "single" ? (requested === "multi" ? "mt_load_failed" : singleReason) : null;
      trackVital("ffmpeg_init", startedAt, { engine, load_number });
      trackAction("ffmpeg_load_success", {
        engine,
        engine_requested: requested,
        ...(reason ? { single_reason: reason } : {}),
        load_number,
        durationMs: Math.round(now() - startedAt),
      });
    },
    failed(err: unknown) {
      if (done) return;
      done = true;
      trackAction("ffmpeg_load_failure", {
        engine_requested: requested,
        load_number,
        category: engineLoadFailureCategory(err),
        durationMs: Math.round(now() - startedAt),
      });
    },
    abandoned() {
      done = true;
    },
  };
}

/** Test helper. */
export function resetEngineLoadCountForTests() {
  loadsThisPage = 0;
}
