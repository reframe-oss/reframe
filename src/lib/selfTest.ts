import { getEngineMode, loadFFmpeg } from "./ffmpeg";

export interface SelfTestResult {
  /** The page is cross-origin isolated (COOP + COEP headers present). */
  isolated: boolean;
  /** SharedArrayBuffer exists, which the multi-threaded core needs. */
  sharedArrayBuffer: boolean;
  /** Which FFmpeg core loaded, or null if it failed. */
  engine: "multi" | "single" | null;
  /** Milliseconds to load the engine. */
  loadMs: number;
  error?: string;
}

declare global {
  interface Window {
    /**
     * Loads the FFmpeg engine and reports how it went. Used by the Datadog
     * Synthetic test (docs/DATADOG.md) to check production without a video.
     * Downloads the engine (~30 MB) on first call; not called by the app.
     */
    __reframeSelfTest?: () => Promise<SelfTestResult>;
  }
}

export async function runSelfTest(): Promise<SelfTestResult> {
  const started = performance.now();
  const base = {
    isolated: typeof crossOriginIsolated !== "undefined" && crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
  };
  try {
    await loadFFmpeg();
    return { ...base, engine: getEngineMode(), loadMs: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      ...base,
      engine: null,
      loadMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function installSelfTest() {
  if (typeof window !== "undefined") window.__reframeSelfTest = runSelfTest;
}
