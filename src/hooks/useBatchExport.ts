"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { exportVideo } from "@/lib/ffmpeg";
import { batchRecipe, isVideoFile, MAX_BATCH_FILES, uniqueOutputNames, type BatchItemStatus } from "@/lib/batchExport";
import { trackFeature } from "@/lib/featureTelemetry";
import { describeExportError, extractMetadata } from "@/hooks/useVideoEditor";
import type { BackgroundMusicOptions, EditRecipe, ExportResult, ImageOverlayOptions } from "@/lib/types";

export interface BatchItem {
  id: string;
  file: File;
  status: BatchItemStatus;
  progress: number;
  result: ExportResult | null;
  error: string | null;
}

export interface BatchSettings {
  recipe: EditRecipe;
  music: BackgroundMusicOptions;
  overlay: ImageOverlayOptions;
}

interface DirectoryHandle {
  getFileHandle(name: string, options: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

/** Whether this browser can save into a folder the user picks (Chromium). */
export function canSaveToFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

let nextId = 0;

/**
 * A queue of videos exported one after another with the same edit. Exports
 * run in the same engine as the editor, so the editor's own Export is
 * disabled while a batch runs (see `running`). Results stay in memory until
 * they're removed or the list is cleared.
 */
export function useBatchExport() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Free every result when the component using the batch goes away.
  useEffect(() => () => itemsRef.current.forEach((item) => item.result?.dispose()), []);

  const patch = useCallback((id: string, update: Partial<BatchItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...update } : item)));
  }, []);

  const add = useCallback((files: File[]) => {
    const videos = files.filter(isVideoFile);
    const ignored = files.length - videos.length;
    const room = Math.max(0, MAX_BATCH_FILES - itemsRef.current.length);
    const added = videos.slice(0, room).map<BatchItem>((file) => ({
      id: `batch-${++nextId}`,
      file,
      status: "queued",
      progress: 0,
      result: null,
      error: null,
    }));
    const dropped = videos.length - added.length;
    itemsRef.current = [...itemsRef.current, ...added];
    setItems(itemsRef.current);
    setNotice(
      [
        ignored > 0 ? `${ignored} file${ignored === 1 ? " isn't a video and was" : "s aren't videos and were"} skipped.` : "",
        dropped > 0 ? `A batch holds up to ${MAX_BATCH_FILES} videos, so ${dropped} ${dropped === 1 ? "wasn't" : "weren't"} added.` : "",
      ]
        .filter(Boolean)
        .join(" ") || null
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item || item.status === "exporting") return prev;
      item.result?.dispose();
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    if (controller.current) return;
    setItems((prev) => {
      prev.forEach((item) => item.result?.dispose());
      return [];
    });
    setNotice(null);
  }, []);

  /** Exports every video that hasn't been exported yet (queued, failed or cancelled), in order. */
  const start = useCallback(
    async (settings: BatchSettings) => {
      if (controller.current) return;
      const todo = itemsRef.current.filter((i) => i.status !== "done");
      if (todo.length === 0) return;
      const abort = new AbortController();
      controller.current = abort;
      setRunning(true);
      setNotice(null);
      trackFeature("batch_export", "start");
      todo.forEach((item) => patch(item.id, { status: "queued", progress: 0, error: null }));
      const recipe = batchRecipe(settings.recipe);
      let failed = 0;

      for (const item of todo) {
        if (abort.signal.aborted) break;
        patch(item.id, { status: "exporting", progress: 0 });
        try {
          // The duration lets FFmpeg's progress and the stall watchdog work
          // for files without one in their header; 0 if it can't be read.
          const duration = await extractMetadata(item.file).then((m) => m.duration).catch(() => 0);
          const result = await exportVideo(
            item.file,
            recipe,
            (percent) => patch(item.id, { progress: percent }),
            abort.signal,
            settings.music,
            settings.overlay,
            duration > 0 ? duration : undefined
          );
          if (abort.signal.aborted) {
            result.dispose();
            break;
          }
          patch(item.id, { status: "done", progress: 100, result });
        } catch (err) {
          if (abort.signal.aborted) break;
          failed++;
          patch(item.id, { status: "failed", error: describeExportError(err) });
        }
      }

      if (abort.signal.aborted) {
        setItems((prev) => prev.map((i) => (i.status === "exporting" || i.status === "queued" ? { ...i, status: "cancelled", progress: 0 } : i)));
        trackFeature("batch_export", "cancel");
      } else {
        trackFeature("batch_export", failed > 0 ? "done_with_failures" : "done");
      }
      controller.current = null;
      setRunning(false);
    },
    [patch]
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
  }, []);

  /** Writes every finished video into a folder the user picks. Returns how many were saved. */
  const saveAllToFolder = useCallback(async (): Promise<number> => {
    const done = itemsRef.current.filter((i) => i.status === "done" && i.result);
    if (done.length === 0 || !canSaveToFolder()) return 0;
    let dir: DirectoryHandle;
    try {
      dir = await (window as unknown as { showDirectoryPicker(o: { mode: "readwrite" }): Promise<DirectoryHandle> }).showDirectoryPicker({
        mode: "readwrite",
      });
    } catch {
      return 0; // the user closed the picker
    }
    const names = uniqueOutputNames(done.map((i) => ({ name: i.file.name, format: i.result!.format })));
    let saved = 0;
    for (const [index, item] of done.entries()) {
      try {
        const handle = await dir.getFileHandle(names[index]!, { create: true });
        const writable = await handle.createWritable();
        await writable.write(item.result!.blob);
        await writable.close();
        saved++;
      } catch {
        // keep going: the rest can still be saved
      }
    }
    trackFeature("batch_export", "save_folder");
    setNotice(saved === done.length ? `Saved ${saved} video${saved === 1 ? "" : "s"} to the folder.` : `Saved ${saved} of ${done.length} videos; the others couldn't be written.`);
    return saved;
  }, []);

  return { items, running, notice, add, remove, clear, start, cancel, saveAllToFolder };
}
