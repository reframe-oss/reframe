// The crop tool's rectangle: which part of the source frame is kept, as
// fractions (0–1) of the source as it appears in the preview (before
// rotation). Fractions keep it independent of the video's resolution, so a
// saved crop still means the same thing after a refresh or in a project file.
// FFmpeg applies it first, before rotation and resizing (ffmpegArgs.ts).

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The smallest crop, per side, as a fraction of the source. */
export const MIN_CROP = 0.05;

export const FULL_FRAME: CropRect = { x: 0, y: 0, width: 1, height: 1 };

/** Aspect choices in the crop tool. `null` is free-form. */
export const CROP_ASPECTS = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1 : 1", ratio: 1 },
  { id: "4:5", label: "4 : 5", ratio: 4 / 5 },
  { id: "9:16", label: "9 : 16", ratio: 9 / 16 },
  { id: "16:9", label: "16 : 9", ratio: 16 / 9 },
] as const;

export type CropAspectId = (typeof CROP_ASPECTS)[number]["id"] | "output";

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** True when the crop keeps the whole frame (so there is nothing to crop). */
export function isFullFrame(crop: CropRect | null | undefined): boolean {
  if (!crop) return true;
  return crop.x <= 0.0005 && crop.y <= 0.0005 && crop.width >= 0.9995 && crop.height >= 0.9995;
}

/** Keeps a crop inside the frame and at least MIN_CROP on each side, rounded to 4 places. */
export function clampCrop(crop: CropRect): CropRect {
  const width = clamp(Number.isFinite(crop.width) ? crop.width : 1, MIN_CROP, 1);
  const height = clamp(Number.isFinite(crop.height) ? crop.height : 1, MIN_CROP, 1);
  const x = clamp(Number.isFinite(crop.x) ? crop.x : 0, 0, 1 - width);
  const y = clamp(Number.isFinite(crop.y) ? crop.y : 0, 0, 1 - height);
  return { x: round4(x), y: round4(y), width: round4(width), height: round4(height) };
}

/**
 * The largest crop of aspect `ratio` (width / height, in pixels) that fits a
 * source of aspect `sourceRatio`, centred on `around` (by default the centre
 * of the frame).
 */
export function cropForAspect(ratio: number, sourceRatio: number, around?: CropRect | null): CropRect {
  if (!(ratio > 0) || !(sourceRatio > 0)) return FULL_FRAME;
  // In fractions of the source, a crop of pixel ratio r has width/height = r / sourceRatio.
  const fractionRatio = ratio / sourceRatio;
  const [width, height] = fractionRatio >= 1 ? [1, 1 / fractionRatio] : [fractionRatio, 1];
  const cx = around ? around.x + around.width / 2 : 0.5;
  const cy = around ? around.y + around.height / 2 : 0.5;
  return clampCrop({ x: cx - width / 2, y: cy - height / 2, width, height });
}

export type CropHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * The crop after dragging `handle` by (dx, dy), in fractions of the source.
 * With an aspect `ratio` (pixels), resizing keeps that shape: the drag sets
 * the width (or the height, for the top and bottom edges) and the other side
 * follows, anchored on the opposite edge or corner.
 */
export function dragCrop(
  start: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number | null,
  sourceRatio: number
): CropRect {
  if (handle === "move") {
    return clampCrop({
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.width),
      y: clamp(start.y + dy, 0, 1 - start.height),
    });
  }

  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - MIN_CROP);
  if (handle.includes("e")) right = clamp(right + dx, left + MIN_CROP, 1);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + MIN_CROP, 1);

  if (ratio && sourceRatio > 0) {
    const fractionRatio = ratio / sourceRatio;
    const vertical = handle === "n" || handle === "s";
    let width = right - left;
    let height = bottom - top;
    if (vertical) width = height * fractionRatio;
    else height = width / fractionRatio;
    // Shrink to fit the room on the anchored side.
    const roomW = handle.includes("w") ? right : handle.includes("e") ? 1 - left : Math.min(1, 2 * Math.min(start.x + start.width / 2, 1 - (start.x + start.width / 2)));
    const roomH = handle.includes("n") ? bottom : handle.includes("s") ? 1 - top : Math.min(1, 2 * Math.min(start.y + start.height / 2, 1 - (start.y + start.height / 2)));
    const scale = Math.min(1, roomW / width, roomH / height);
    width *= scale;
    height *= scale;
    const cx = start.x + start.width / 2;
    const cy = start.y + start.height / 2;
    left = handle.includes("w") ? right - width : handle.includes("e") ? left : cx - width / 2;
    top = handle.includes("n") ? bottom - height : handle.includes("s") ? top : cy - height / 2;
    return clampCrop({ x: left, y: top, width, height });
  }

  return clampCrop({ x: left, y: top, width: right - left, height: bottom - top });
}

/**
 * The FFmpeg crop filter for a crop, or null when it keeps the whole frame.
 * Sizes are rounded down to even pixels (most encoders need them).
 */
export function cropFilter(crop: CropRect | null | undefined): string | null {
  if (!crop || isFullFrame(crop)) return null;
  const c = clampCrop(crop);
  return `crop=trunc(iw*${c.width}/2)*2:trunc(ih*${c.height}/2)*2:trunc(iw*${c.x}):trunc(ih*${c.y})`;
}

/** The crop's size in source pixels, as FFmpeg will produce it. */
export function cropPixels(crop: CropRect, sourceWidth: number, sourceHeight: number) {
  const c = clampCrop(crop);
  return {
    width: Math.floor((sourceWidth * c.width) / 2) * 2,
    height: Math.floor((sourceHeight * c.height) / 2) * 2,
  };
}

/** Validates a crop read from storage, a link or a project file. */
export function isValidCrop(value: unknown): value is CropRect | null {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  const fields = ["x", "y", "width", "height"] as const;
  if (!fields.every((k) => typeof c[k] === "number" && Number.isFinite(c[k]))) return false;
  const { x, y, width, height } = c as unknown as CropRect;
  const eps = 1e-6;
  return (
    width >= MIN_CROP - eps &&
    height >= MIN_CROP - eps &&
    x >= -eps &&
    y >= -eps &&
    x + width <= 1 + eps &&
    y + height <= 1 + eps
  );
}
