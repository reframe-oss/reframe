/**
 * Where the FFmpeg cores are downloaded from. Shared by the engine worker
 * (src/lib/ffmpeg.worker.ts, which checks each file's SRI hash) and the
 * offline check (src/hooks/useOfflineSupport.ts, which looks for these files
 * in the service worker's cache).
 */
export const CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
// MT core aligned to the same version and distribution format as CORE_BASE_URL.
// Previously used @0.12.6/dist/esm which caused two problems:
//   1. The version mismatch meant SRI hashes computed for @0.12.10 were applied
//      to different file contents, causing all MT fetches to fail with an integrity
//      error instead of falling back gracefully.
//   2. The ESM distribution is not consumed the same way as UMD by ffmpeg.js and
//      produced subtle runtime failures in crossOriginIsolated contexts.
export const MT_CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd";

/**
 * The engine files a page loads: the multi-threaded core when cross-origin
 * isolated, which also needs its worker script, otherwise the
 * single-threaded one.
 */
export function engineFileUrls(isolated: boolean): string[] {
  const base = isolated ? MT_CORE_BASE_URL : CORE_BASE_URL;
  return ["ffmpeg-core.js", "ffmpeg-core.wasm", ...(isolated ? ["ffmpeg-core.worker.js"] : [])].map((name) => `${base}/${name}`);
}
