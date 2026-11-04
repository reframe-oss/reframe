import { isUsableDuration } from "./ffmpegArgs";

/**
 * The duration of a video element whose metadata has loaded, in seconds, or 0
 * when it can't be found.
 *
 * Files recorded live (MediaRecorder, so most browser screen recordings) have
 * no duration in their header, and the browser reports Infinity until it has
 * read to the end. Seeking far past the end makes it find the real duration.
 * The element is left at time 0.
 */
export function resolveDuration(video: HTMLVideoElement, timeoutMs = 4000): Promise<number> {
  if (isUsableDuration(video.duration)) return Promise.resolve(video.duration);
  if (video.duration !== Infinity) return Promise.resolve(0);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("durationchange", check);
      video.removeEventListener("timeupdate", check);
      video.removeEventListener("seeked", check);
      try {
        video.currentTime = 0;
      } catch {
        // the element may already be detached
      }
      resolve(value);
    };
    const check = () => {
      if (isUsableDuration(video.duration)) finish(video.duration);
    };
    const timer = setTimeout(() => finish(0), timeoutMs);
    video.addEventListener("durationchange", check);
    video.addEventListener("timeupdate", check);
    video.addEventListener("seeked", check);
    try {
      video.currentTime = Number.MAX_SAFE_INTEGER;
    } catch {
      finish(0);
    }
  });
}
