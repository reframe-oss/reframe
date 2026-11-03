import { trackAction } from "./telemetry";

// Anonymous feature-usage counts: which editing tools people use, never what
// they do with them. Every property is from a closed list below, so a user's
// text (a profile name, a caption) can't end up here. One event name,
// `feature_used`, so the dashboard groups by @context.feature and
// @context.action.

/** Features and the actions each can report. */
export const FEATURE_ACTIONS = {
  export_profile: ["apply", "save", "rename", "delete"],
  safe_area: ["show", "hide"],
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
