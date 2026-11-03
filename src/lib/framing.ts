/**
 * Where the exported picture sits in the 16:9 preview viewer, as CSS insets.
 * The source is shown `object-contain`, so it may itself be letterboxed in
 * the viewer.
 *   fill — the part of the source that survives the crop. FFmpeg scales the
 *          source to cover the output, then crops the centre (ffmpegArgs.ts:
 *          scale=…:force_original_aspect_ratio=increase,crop=…), so a
 *          portrait output from a landscape clip keeps a vertical strip.
 *   fit  — the output's own shape, centred in the viewer; the export pads
 *          the source into it with black bars.
 * Pure, so the framing overlay and the safe-area guides share it and it can
 * be unit-tested.
 */
import { resolveOutputSize } from "./ffmpegArgs";
import type { EditRecipe } from "./types";

export interface OutputFrame {
  mode: "fit" | "fill";
  top: string;
  bottom: string;
  left: string;
  right: string;
}

const VIEWER_RATIO = 16 / 9;
const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;

/** A box of aspect `ratio` centred in a box of aspect `outer`, as % insets. */
function centred(ratio: number, outer: number) {
  if (ratio > outer) {
    const band = (100 - (outer / ratio) * 100) / 2;
    return { top: band, bottom: band, left: 0, right: 0 };
  }
  const band = (100 - (ratio / outer) * 100) / 2;
  return { top: 0, bottom: 0, left: band, right: band };
}

export function outputFrame(
  recipe: Pick<EditRecipe, "preset" | "customWidth" | "customHeight" | "framing">,
  sourceRatio: number = VIEWER_RATIO
): OutputFrame {
  const { width, height } = resolveOutputSize(recipe);
  const outputRatio = width / height;

  if (recipe.framing === "fit") {
    const box = centred(outputRatio, VIEWER_RATIO);
    return { mode: "fit", top: pct(box.top), bottom: pct(box.bottom), left: pct(box.left), right: pct(box.right) };
  }

  // Fill: the source's rectangle in the viewer, then the kept part of it.
  const source = centred(sourceRatio > 0 ? sourceRatio : VIEWER_RATIO, VIEWER_RATIO);
  const kept = centred(outputRatio, sourceRatio > 0 ? sourceRatio : VIEWER_RATIO);
  const sw = 100 - source.left - source.right;
  const sh = 100 - source.top - source.bottom;
  return {
    mode: "fill",
    top: pct(source.top + (kept.top * sh) / 100),
    bottom: pct(source.bottom + (kept.bottom * sh) / 100),
    left: pct(source.left + (kept.left * sw) / 100),
    right: pct(source.right + (kept.right * sw) / 100),
  };
}

/** Safe-area insets inside the output frame: action-safe 90%, title-safe 80%. */
export const SAFE_AREAS = [
  { label: "90%", inset: "5%" },
  { label: "80%", inset: "10%" },
] as const;
