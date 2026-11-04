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

/**
 * Generates a drawText FFmpeg filter for a single text overlay.
 * Escapes special characters and positions text on the output video.
 * Includes font family and custom font file support.
 */
export function buildTextFilter(
  overlay: TextOverlay,
  targetWidth: number,
  targetHeight: number
): string {
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
  let filter = `drawtext=fontfile=${TEXT_FONT_FILE}:text='${escapedText}':x=${pixelX}:y=${pixelY}:fontsize=${overlay.fontSize}:fontcolor=${overlay.color}`;
  if (overlay.fontWeight === "bold" || overlay.fontWeight === "900") {
    const width = Math.max(1, Math.round(overlay.fontSize / (overlay.fontWeight === "900" ? 18 : 28)));
    filter += `:borderw=${width}:bordercolor=${overlay.color}`;
  }
  return filter;
}
