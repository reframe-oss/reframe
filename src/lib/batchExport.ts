// Batch export: the current edit applied to more videos, one at a time.
// Pure helpers here; the queue lives in useBatchExport.

import type { EditRecipe } from "./types";

/** Videos one batch can hold. Each export runs in turn, so this only bounds the list. */
export const MAX_BATCH_FILES = 50;

export type BatchItemStatus = "queued" | "exporting" | "done" | "failed" | "cancelled";

/**
 * The edit used for every video in a batch: the current one, with the trim
 * reset to the whole clip (trim points belong to the video they were set
 * on). Everything else is reused: size, framing, format, quality, crop,
 * colour, rotation, speed, audio and overlays.
 */
export function batchRecipe(recipe: EditRecipe): EditRecipe {
  return { ...recipe, trimStart: 0, trimEnd: null };
}

const EXTENSIONS: Record<EditRecipe["format"], string> = { mp4: "mp4", webm: "webm", mkv: "mkv", gif: "gif", mp3: "mp3", wav: "wav" };

/** "Holiday clip.mov" → "Holiday clip-reframe.mp4". */
export function batchOutputName(inputName: string, format: EditRecipe["format"]): string {
  const dot = inputName.lastIndexOf(".");
  const base = (dot > 0 ? inputName.slice(0, dot) : inputName).trim() || "video";
  // Characters no file system accepts become "_".
  const safe = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);
  return `${safe}-reframe.${EXTENSIONS[format]}`;
}

/** Output names for a batch, made unique with " (2)", " (3)"… when two videos share a name. */
export function uniqueOutputNames(outputs: { name: string; format: EditRecipe["format"] }[]): string[] {
  const seen = new Map<string, number>();
  return outputs.map(({ name, format }) => {
    const out = batchOutputName(name, format);
    const key = out.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return out;
    const dot = out.lastIndexOf(".");
    return `${out.slice(0, dot)} (${count})${out.slice(dot)}`;
  });
}

/** Whether a dropped or chosen file looks like a video. */
export function isVideoFile(file: Pick<File, "type" | "name">): boolean {
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|m4v|mov|webm|mkv|avi|ogv|3gp)$/i.test(file.name);
}

/** Overall progress of a batch, 0–100: finished videos count fully, the running one by its progress. */
export function batchProgress(items: { status: BatchItemStatus; progress: number }[]): number {
  const counted = items.filter((i) => i.status !== "cancelled");
  if (counted.length === 0) return 0;
  const total = counted.reduce((sum, i) => {
    if (i.status === "done" || i.status === "failed") return sum + 100;
    if (i.status === "exporting") return sum + Math.min(100, Math.max(0, i.progress));
    return sum;
  }, 0);
  return Math.round(total / counted.length);
}
