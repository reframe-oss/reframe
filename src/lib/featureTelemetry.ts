import { trackAction } from "./telemetry";
import { DEFAULT_RECIPE } from "./constants";
import type { EditRecipe } from "./types";
import { isFullFrame } from "./crop";

// Anonymous feature-usage counts: which editing tools people use, never what
// they do with them. Every property is from a closed list below, so a user's
// text (a profile name, a caption) can't end up here. One event name,
// `feature_used`, so the dashboard groups by @context.feature and
// @context.action.

/** Features and the actions each can report. */
export const FEATURE_ACTIONS = {
  export_profile: ["apply", "save", "rename", "delete"],
  safe_area: ["show", "hide"],
  history: ["undo", "redo"],
  project_file: ["save", "open"],
  preview_tool: ["compare", "grid", "framing_guide", "save_frame"],
  crop_tool: ["aspect", "drag", "reset"],
  batch_export: ["start", "done", "done_with_failures", "cancel", "save_folder"],
  trim_timeline: ["seek", "drag_handle"],
  join_clips: ["add", "reorder", "start", "done", "cancel", "undo"],
  // One event per editing tool an export used (see toolsUsed).
  trim: ["exported"],
  rotate: ["exported"],
  speed: ["exported"],
  mute: ["exported"],
  volume: ["exported"],
  normalize_audio: ["exported"],
  text_overlay: ["exported"],
  image_overlay: ["exported"],
  background_music: ["exported"],
  color_adjustments: ["exported"],
  sharpen: ["exported"],
  denoise: ["exported"],
  stabilization: ["exported"],
  fill_framing: ["exported"],
  custom_size: ["exported"],
  crop: ["exported"],
} as const;

export type Feature = keyof typeof FEATURE_ACTIONS;
export type FeatureAction<F extends Feature> = (typeof FEATURE_ACTIONS)[F][number];

/** Built-in profile slugs that may be reported; anything else is "custom". */
const REPORTABLE_PROFILES = new Set([
  "landscape-1080",
  "landscape-720",
  "square-1080",
  "portrait-4-5",
  "portrait-9-16",
]);

/** "builtin:square-1080" → "square-1080"; a user's profile → "custom". */
export function profileKind(profileId: string | null | undefined): string {
  const slug = profileId?.startsWith("builtin:") ? profileId.slice("builtin:".length) : null;
  return slug && REPORTABLE_PROFILES.has(slug) ? slug : "custom";
}

export function trackFeature<F extends Feature>(feature: F, action: FeatureAction<F>, detail?: { profile?: string }) {
  trackAction("feature_used", {
    feature,
    action,
    ...(detail?.profile !== undefined ? { profile: profileKind(detail.profile) } : {}),
  });
}

export type ExportTool = {
  [F in Feature]: (typeof FEATURE_ACTIONS)[F] extends readonly ["exported"] ? F : never;
}[Feature];

/** The editing tools a recipe uses, compared with the defaults. */
export function toolsUsed(recipe: EditRecipe, extras: { music?: boolean; imageOverlay?: boolean } = {}): ExportTool[] {
  const d = DEFAULT_RECIPE;
  const tools: ExportTool[] = [];
  if (recipe.trimStart > 0 || recipe.trimEnd !== null) tools.push("trim");
  if (recipe.rotate !== 0) tools.push("rotate");
  if (recipe.speed !== d.speed) tools.push("speed");
  if (!recipe.keepAudio) tools.push("mute");
  if (recipe.volume !== d.volume) tools.push("volume");
  if (recipe.normalizeAudio) tools.push("normalize_audio");
  if ((recipe.textOverlays?.length ?? 0) > 0) tools.push("text_overlay");
  if (extras.imageOverlay) tools.push("image_overlay");
  if (extras.music) tools.push("background_music");
  if (recipe.brightness !== d.brightness || recipe.contrast !== d.contrast || recipe.saturation !== d.saturation) {
    tools.push("color_adjustments");
  }
  if (recipe.sharpness !== d.sharpness) tools.push("sharpen");
  if (recipe.denoise) tools.push("denoise");
  if (recipe.stabilization) tools.push("stabilization");
  if (recipe.framing === "fill") tools.push("fill_framing");
  if (recipe.preset === "custom") tools.push("custom_size");
  if (!isFullFrame(recipe.crop)) tools.push("crop");
  return tools;
}

/** One feature_used event per tool the export uses. */
export function trackExportTools(recipe: EditRecipe, extras: { music?: boolean; imageOverlay?: boolean } = {}) {
  for (const tool of toolsUsed(recipe, extras)) trackFeature(tool, "exported" as FeatureAction<typeof tool>);
}
