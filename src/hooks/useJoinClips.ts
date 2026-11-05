"use client";

import { useCallback, useRef, useState } from "react";
import { joinClips } from "@/lib/ffmpeg";
import { isVideoFile } from "@/lib/batchExport";
import { joinedFileName, joinProblem, MAX_JOIN_CLIPS, moveClip } from "@/lib/joinClips";
import { trackFeature } from "@/lib/featureTelemetry";
import { describeExportError, extractMetadata } from "@/hooks/useVideoEditor";

export interface JoinClip {
  id: string;
  file: File;
  /** 0 until the clip's details have been read. */
  width: number;
  height: number;
  duration: number;
  status: "reading" | "ready" | "error";
}

interface SourceMeta {
  width: number;
  height: number;
  duration: number;
}

let nextId = 0;
const newId = () => `clip-${++nextId}`;

function sourceClip(file: File, meta: SourceMeta | null): JoinClip {
  return {
    id: newId(),
    file,
    width: meta?.width ?? 0,
    height: meta?.height ?? 0,
    duration: meta?.duration ?? 0,
    status: meta ? "ready" : "reading",
  };
}

/**
 * Clips to join, starting with the editor's video. Joining replaces the
 * editor's video with the result through `replaceSource`, so every other
 * tool then works on the joined clip; `undo` puts the previous video and
 * clip list back. The join uses the export engine, so nothing else may run
 * on it meanwhile (see `running`).
 */
export function useJoinClips(source: File | null, sourceMeta: SourceMeta | null, replaceSource: (file: File) => void) {
  const [clips, setClips] = useState<JoinClip[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  /** The video and clips before the last join, for undo; `result` is what the join produced. */
  const [lastJoin, setLastJoin] = useState<{ source: File; clips: JoinClip[]; result: File } | null>(null);
  const controller = useRef<AbortController | null>(null);

  // Follow the editor's video: a new one starts a new list, the join's own
  // result keeps the undo, and the pre-join video coming back restores its list.
  const [followed, setFollowed] = useState<{ file: File | null; hasMeta: boolean }>({ file: null, hasMeta: false });
  if (source !== followed.file || !!sourceMeta !== followed.hasMeta) {
    setFollowed({ file: source, hasMeta: !!sourceMeta });
    if (!source) {
      setClips([]);
    } else if (source === followed.file) {
      // Same video, its details just arrived.
      setClips((prev) => prev.map((clip) => (clip.file === source ? sourceClip(source, sourceMeta) : clip)));
    } else if (lastJoin && source === lastJoin.result) {
      setClips([sourceClip(source, sourceMeta)]);
    } else if (lastJoin && source === lastJoin.source) {
      setClips(lastJoin.clips);
      setLastJoin(null);
    } else {
      setClips([sourceClip(source, sourceMeta)]);
      setLastJoin(null);
      setNotice(null);
    }
  }

  const patch = useCallback((id: string, update: Partial<JoinClip>) => {
    setClips((prev) => prev.map((clip) => (clip.id === id ? { ...clip, ...update } : clip)));
  }, []);

  const add = useCallback(
    (files: File[]) => {
      const videos = files.filter(isVideoFile);
      const room = Math.max(0, MAX_JOIN_CLIPS - clips.length);
      const added = videos.slice(0, room).map<JoinClip>((file) => ({
        id: newId(),
        file,
        width: 0,
        height: 0,
        duration: 0,
        status: "reading",
      }));
      if (added.length === 0 && videos.length === 0) {
        setNotice({ tone: "error", text: "Those files aren't videos." });
        return;
      }
      setClips((prev) => [...prev, ...added]);
      const skipped = files.length - videos.length;
      const dropped = videos.length - added.length;
      setNotice(
        dropped > 0
          ? { tone: "error", text: `A join holds up to ${MAX_JOIN_CLIPS} clips, so ${dropped} ${dropped === 1 ? "wasn't" : "weren't"} added.` }
          : skipped > 0
            ? { tone: "error", text: `${skipped} file${skipped === 1 ? " isn't a video and was" : "s aren't videos and were"} skipped.` }
            : null
      );
      if (added.length > 0) trackFeature("join_clips", "add");
      for (const clip of added) {
        extractMetadata(clip.file)
          .then(({ width, height, duration }) => patch(clip.id, { width, height, duration, status: "ready" }))
          .catch(() => patch(clip.id, { status: "error" }));
      }
    },
    [clips.length, patch]
  );

  const remove = useCallback((id: string) => setClips((prev) => prev.filter((clip) => clip.id !== id)), []);

  const move = useCallback((from: number, to: number) => {
    setClips((prev) => moveClip(prev, from, to));
    trackFeature("join_clips", "reorder");
  }, []);

  const ready = clips.every((clip) => clip.status === "ready");
  const problem = clips.some((clip) => clip.status === "error")
    ? "Remove the clips that couldn't be read."
    : joinProblem(clips.map((clip) => ({ size: clip.file.size, width: clip.width, height: clip.height, duration: clip.duration })));

  const start = useCallback(async () => {
    if (running || !source || problem || !ready) return;
    const first = clips[0]!;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setProgress(0);
    setNotice(null);
    trackFeature("join_clips", "start");
    try {
      const result = await joinClips(
        clips.map(({ file, duration }) => ({ file, duration })),
        first.width,
        first.height,
        setProgress,
        abort.signal
      );
      const joined = new File([result.blob], joinedFileName(first.file.name), { type: "video/mp4" });
      result.dispose();
      setLastJoin({ source, clips, result: joined });
      replaceSource(joined);
      setNotice({ tone: "info", text: `Joined ${clips.length} clips. The editor now uses the joined video.` });
      trackFeature("join_clips", "done");
    } catch (error) {
      if (abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        setNotice({ tone: "info", text: "Join cancelled." });
      } else {
        setNotice({ tone: "error", text: describeExportError(error).replace(/^Export failed/, "Join failed") });
      }
    } finally {
      controller.current = null;
      setRunning(false);
    }
  }, [clips, problem, ready, replaceSource, running, source]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    trackFeature("join_clips", "cancel");
  }, []);

  const undo = useCallback(() => {
    if (!lastJoin) return;
    replaceSource(lastJoin.source);
    setNotice(null);
    trackFeature("join_clips", "undo");
  }, [lastJoin, replaceSource]);

  return {
    clips,
    running,
    progress,
    notice,
    /** Why Join is unavailable, or null. */
    problem: ready ? problem : "Reading the clips…",
    canUndo: !!lastJoin && source === lastJoin.result,
    add,
    remove,
    move,
    start,
    cancel,
    undo,
  };
}
