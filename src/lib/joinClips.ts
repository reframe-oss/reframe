/** Joining several clips into one source video (see buildJoinArguments). */

/** At most this many clips in one join. */
export const MAX_JOIN_CLIPS = 10;
/** Combined size of the clips; the joined output has to fit in the engine's memory too. */
export const MAX_JOIN_BYTES = 1024 * 1024 * 1024;
/** Clips above about 1440p decode with far more memory, so fewer of them may be joined. */
export const LARGE_CLIP_PIXELS = 2560 * 1440;
export const MAX_LARGE_JOIN_CLIPS = 3;

export interface JoinClipInfo {
  size: number;
  width: number;
  height: number;
  duration: number;
}

/** Why these clips can't be joined, or null when they can. */
export function joinProblem(clips: JoinClipInfo[]): string | null {
  if (clips.length < 2) return "Add at least one more clip to join.";
  if (clips.length > MAX_JOIN_CLIPS) return `A join holds up to ${MAX_JOIN_CLIPS} clips.`;
  const bytes = clips.reduce((sum, clip) => sum + clip.size, 0);
  if (bytes > MAX_JOIN_BYTES) return "These clips are over 1 GB together, more than the browser can join. Remove some or use shorter clips.";
  const large = clips.some((clip) => clip.width * clip.height > LARGE_CLIP_PIXELS);
  if (large && clips.length > MAX_LARGE_JOIN_CLIPS) {
    return `Clips larger than 1440p can be joined at most ${MAX_LARGE_JOIN_CLIPS} at a time.`;
  }
  return null;
}

/** Total length in seconds, or null when any clip's length is unknown. */
export function joinedDuration(clips: Pick<JoinClipInfo, "duration">[]): number | null {
  if (clips.some((clip) => !(clip.duration > 0) || !Number.isFinite(clip.duration))) return null;
  return clips.reduce((sum, clip) => sum + clip.duration, 0);
}

/** "trip.mov" → "trip-joined.mp4". */
export function joinedFileName(firstName: string): string {
  const base = firstName.replace(/\.[^.]+$/, "") || "video";
  return `${base}-joined.mp4`;
}

/** A new order with the clip at `from` moved to `to`. */
export function moveClip<T>(clips: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= clips.length || to >= clips.length) return clips;
  const next = clips.slice();
  const [clip] = next.splice(from, 1);
  next.splice(to, 0, clip!);
  return next;
}

/** The video frame rate in FFmpeg's input description ("… 1280x720 …, 29.97 fps, …"). */
export function frameRateFromLog(log: string): number | null {
  for (const line of log.split("\n")) {
    if (!/Stream #\d+:\d+.*Video:/.test(line)) continue;
    const match = line.match(/(\d+(?:\.\d+)?) fps/) ?? line.match(/(\d+(?:\.\d+)?) tbr/);
    const fps = match ? Number(match[1]) : NaN;
    if (fps >= 1 && fps <= 240) return fps;
  }
  return null;
}
