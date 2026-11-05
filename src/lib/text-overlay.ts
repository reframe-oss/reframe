import { TextOverlay } from "./types";
/**
 * Name of the font file in FFmpeg's virtual filesystem, and where the worker
 * fetches it from. Geist Regular, SIL Open Font License (public/fonts/Geist-OFL.txt).
 */
export const TEXT_FONT_FILE = "reframe-text.ttf";
export const TEXT_FONT_URL = "/fonts/Geist-Regular.ttf";

/**
 * Generates a unique ID for a text overlay.
 */
export function generateTextOverlayId(): string {
  return `text-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Creates a default text overlay with sensible defaults.
 */
export function createDefaultTextOverlay(): TextOverlay {
  return {
    id: generateTextOverlayId(),
    text: "Enter text",
    x: 50, // Centered horizontally
    y: 20, // Near top
    fontSize: 48,
    color: "#ffffff",
    fontWeight: "normal",
    fontFamily: "Arial", // Default to Arial for immediate visibility
  };
}

/**
 * Calculates the position of a text overlay relative to the preview container.
 * @param percentX - Horizontal position as percentage (0-100)
 * @param percentY - Vertical position as percentage (0-100)
 * @param containerWidth - Width of the preview container in pixels
 * @param containerHeight - Height of the preview container in pixels
 */
export function getTextPixelPosition(
  percentX: number,
  percentY: number,
  containerWidth: number,
  containerHeight: number
): { left: number; top: number } {
  return {
    left: (percentX / 100) * containerWidth,
    top: (percentY / 100) * containerHeight,
  };
}

/**
 * Converts pixel position back to percentage within the container.
 */
export function getTextPercentPosition(
  pixelX: number,
  pixelY: number,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(100, (pixelX / containerWidth) * 100)),
    y: Math.max(0, Math.min(100, (pixelY / containerHeight) * 100)),
  };
}

/** Whether the text is on screen at `time` seconds of the source video. */
export function isTextVisibleAt(overlay: Pick<TextOverlay, "start" | "end">, time: number): boolean {
  return time >= (overlay.start ?? 0) && (overlay.end === undefined || time < overlay.end);
}

/** The part of the source video that the export keeps, and how fast it plays. */
export interface TextTiming {
  trimStart: number;
  trimEnd: number | null;
  speed: number;
}

/**
 * The drawtext `enable` expression for an overlay's start and end, which are
 * in source seconds. drawtext runs after trim and speed, so its `t` is the
 * exported clip's time. Returns "" when the text is on for the whole export,
 * and null when it falls outside the kept part and so never shows.
 */
export function textEnableExpression(overlay: Pick<TextOverlay, "start" | "end">, timing: TextTiming): string | null {
  const { trimStart, trimEnd, speed } = timing;
  const start = overlay.start ?? 0;
  const end = overlay.end;
  if (end !== undefined && end <= trimStart) return null;
  if (trimEnd !== null && start >= trimEnd) return null;
  const from = start > trimStart ? (start - trimStart) / speed : 0;
  const until = end !== undefined && (trimEnd === null || end < trimEnd) ? (end - trimStart) / speed : null;
  const s = (n: number) => String(Number(n.toFixed(3)));
  if (from === 0 && until === null) return "";
  if (until === null) return `gte(t,${s(from)})`;
  if (from === 0) return `lt(t,${s(until)})`;
  return `between(t,${s(from)},${s(until)})`;
}

/**
 * Generates a drawText FFmpeg filter for a single text overlay, or null when
 * its start and end put it outside the exported part of the video.
 * The text is centred on its position, as in the preview.
 */
export function buildTextFilter(
  overlay: TextOverlay,
  targetWidth: number,
  targetHeight: number,
  timing: TextTiming = { trimStart: 0, trimEnd: null, speed: 1 }
): string | null {
  const enable = textEnableExpression(overlay, timing);
  if (enable === null) return null;

  // Escape special characters for FFmpeg drawtext filter
  const escapedText = overlay.text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%");

  // Convert percentage position to pixel position
  const pixelX = Math.round((overlay.x / 100) * targetWidth);
  const pixelY = Math.round((overlay.y / 100) * targetHeight);

  // FFmpeg.wasm has no system fonts and no fontconfig, so `font=` can't
  // resolve and drawtext needs a font file: the worker writes the bundled one
  // (public/fonts) into FFmpeg's filesystem as TEXT_FONT_FILE. drawtext has
  // no weight option either; bold is drawn as a thin outline in the text colour.
  let filter = `drawtext=fontfile=${TEXT_FONT_FILE}:text='${escapedText}':x=${pixelX}-text_w/2:y=${pixelY}-text_h/2:fontsize=${overlay.fontSize}:fontcolor=${overlay.color}`;
  if (overlay.fontWeight === "bold" || overlay.fontWeight === "900") {
    const width = Math.max(1, Math.round(overlay.fontSize / (overlay.fontWeight === "900" ? 18 : 28)));
    filter += `:borderw=${width}:bordercolor=${overlay.color}`;
  }
  if (overlay.box) {
    filter += `:box=1:boxcolor=black@0.55:boxborderw=${Math.max(2, Math.round(overlay.fontSize * 0.3))}`;
  }
  if (enable) filter += `:enable='${enable}'`;
  return filter;
}
