import type { TextOverlay } from "./types";
import { generateTextOverlayId } from "./text-overlay";
import { MAX_OVERLAY_TEXT_LENGTH, MAX_TEXT_OVERLAYS } from "./project";

/** One subtitle cue, in seconds of the source video. */
export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

/** Caption files are small text; anything bigger is not one. */
export const MAX_CAPTION_FILE_BYTES = 1024 * 1024;

// 00:01:02,345 (SRT) or 00:01:02.345 / 01:02.345 (WebVTT).
const TIME = String.raw`(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})`;
const TIMING_LINE = new RegExp(`^\\s*${TIME}\\s*-->\\s*${TIME}`);

function seconds(h: string | undefined, m: string, s: string, ms: string): number {
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

/**
 * Reads the cues of an SRT or WebVTT file. Cue numbers, WebVTT headers, NOTE
 * and STYLE blocks, cue settings and formatting tags (<i>, {\an8}) are
 * dropped; cues without text or with an end before their start are skipped.
 */
export function parseCaptions(source: string): CaptionCue[] {
  const blocks = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => TIMING_LINE.test(line));
    if (at === -1) continue;
    const m = TIMING_LINE.exec(lines[at]!)!;
    const start = seconds(m[1], m[2]!, m[3]!, m[4]!);
    const end = seconds(m[5], m[6]!, m[7]!, m[8]!);
    const text = lines
      .slice(at + 1)
      .map((line) => line.replace(/<[^>]*>/g, "").replace(/\{\\[^}]*\}/g, "").trim())
      .filter(Boolean)
      .join("\n");
    if (!text || !(end > start)) continue;
    cues.push({ start, end, text: text.slice(0, MAX_OVERLAY_TEXT_LENGTH) });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/**
 * Text overlays for caption cues: white text in a dark box, centred near the
 * bottom of the frame, sized for the output height. `room` is how many more
 * overlays the edit can hold; cues past it are dropped.
 */
export function captionOverlays(cues: CaptionCue[], outputHeight: number, room: number = MAX_TEXT_OVERLAYS): TextOverlay[] {
  const fontSize = Math.min(120, Math.max(12, Math.round(outputHeight * 0.045)));
  return cues.slice(0, Math.max(0, room)).map((cue) => ({
    id: generateTextOverlayId(),
    text: cue.text,
    x: 50,
    y: 88,
    fontSize,
    color: "#ffffff",
    fontWeight: "normal",
    start: cue.start,
    end: cue.end,
    box: true,
  }));
}
