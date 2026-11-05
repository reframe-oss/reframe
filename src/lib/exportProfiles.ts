/**
 * Export profiles: named, reusable output shapes (size, framing, format,
 * quality). Data model and state transitions: docs/EXPORT_PROFILES.md.
 *
 * A profile only ever replaces the output fields of the recipe. Trims,
 * rotation, speed, audio, adjustments and overlays are never touched.
 */
import { PRESETS } from "./presets";
import { resolveOutputSize } from "./ffmpegArgs";
import type { EditState } from "./editHistory";
import { OUTPUT_FORMATS, type OutputFormat } from "./types";

export const PROFILE_STORAGE_KEY = "reframe:export-profiles";
export const PROFILE_SCHEMA_VERSION = 1;
export const MAX_USER_PROFILES = 30;
export const MAX_PROFILE_NAME = 60;
/** Above this many pixels on either side a GIF gets very large (≈130 MB for 6 s at 1080p). */
export const GIF_LARGE_SIDE = 1080;

export type ProfileFormat = OutputFormat;

export interface ProfileSettings {
  preset: string;
  customWidth: number;
  customHeight: number;
  framing: "fit" | "fill";
  format: ProfileFormat;
  quality: number;
}

export interface ExportProfile {
  id: string;
  name: string;
  builtIn: boolean;
  settings: ProfileSettings;
}

const builtIn = (slug: string, name: string, preset: string): ExportProfile => {
  const size = PRESETS.find((p) => p.id === preset)!;
  return {
    id: `builtin:${slug}`,
    name,
    builtIn: true,
    settings: { preset, customWidth: size.width, customHeight: size.height, framing: "fit", format: "mp4", quality: 23 },
  };
};

/** Named by shape and size, not platform. Each maps to an existing preset. */
export const BUILT_IN_PROFILES: readonly ExportProfile[] = [
  builtIn("landscape-1080", "Landscape 1080p", "landscape-16-9"),
  builtIn("landscape-720", "Landscape 720p", "twitter-hd"),
  builtIn("square-1080", "Square 1080", "square-1-1"),
  builtIn("portrait-4-5", "Portrait 4 : 5", "instagram-4-5"),
  builtIn("portrait-9-16", "Portrait 9 : 16", "vertical-9-16"),
];

type Recipe = EditState["recipe"];

/** The output fields of a recipe, as profile settings. */
export function settingsFromRecipe(recipe: Recipe): ProfileSettings {
  return {
    preset: recipe.preset,
    customWidth: recipe.customWidth,
    customHeight: recipe.customHeight,
    framing: recipe.framing,
    format: recipe.format,
    quality: recipe.quality,
  };
}

/**
 * Replaces only the output fields. For a preset, the custom size is left as
 * the user had it (it only matters for "custom"). GIF has no audio, the same
 * rule the editor applies when GIF is picked by hand.
 */
export function applyProfile(edit: EditState, settings: ProfileSettings): EditState {
  const recipe: Recipe = {
    ...edit.recipe,
    preset: settings.preset,
    framing: settings.framing,
    format: settings.format,
    quality: settings.quality,
    ...(settings.preset === "custom" ? { customWidth: settings.customWidth, customHeight: settings.customHeight } : {}),
  };
  if (recipe.format === "gif") recipe.keepAudio = false;
  return { ...edit, recipe };
}

/** Whether the recipe's output currently is this profile (what the UI marks active). */
export function profileMatches(recipe: Recipe, settings: ProfileSettings): boolean {
  if (recipe.preset !== settings.preset) return false;
  if (settings.preset === "custom" && (recipe.customWidth !== settings.customWidth || recipe.customHeight !== settings.customHeight)) return false;
  return recipe.framing === settings.framing && recipe.format === settings.format && recipe.quality === settings.quality;
}

/** Encoded size for these settings — the same function the FFmpeg worker uses. */
export const profileOutputSize = (settings: ProfileSettings) => resolveOutputSize(settings);

/** Plain-language notes for combinations that behave differently. */
export function profileNotes(settings: ProfileSettings): string[] {
  const notes: string[] = [];
  const size = profileOutputSize(settings);
  if (settings.format === "gif") {
    notes.push("GIF has no audio, and quality isn't used for GIF.");
    if (Math.max(size.width, size.height) > GIF_LARGE_SIDE) {
      notes.push("Large GIF: a few seconds at this size can be well over 100 MB.");
    }
  }
  if (settings.preset === "custom" && (size.width !== settings.customWidth || size.height !== settings.customHeight)) {
    notes.push(`Exports at ${size.width} × ${size.height} (rounded to even numbers).`);
  }
  return notes;
}

// ── Validation ───────────────────────────────────────────────────────────────

const FORMATS: readonly ProfileFormat[] = OUTPUT_FORMATS;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Validates settings strictly; returns a fresh object with only known fields, or null. */
export function parseSettings(raw: unknown): ProfileSettings | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.preset !== "string" || !PRESETS.some((p) => p.id === raw.preset)) return null;
  if (!int(raw.customWidth, 16, 7680) || !int(raw.customHeight, 16, 7680)) return null;
  if (raw.framing !== "fit" && raw.framing !== "fill") return null;
  if (!FORMATS.includes(raw.format as ProfileFormat)) return null;
  if (!int(raw.quality, 18, 30)) return null;
  return {
    preset: raw.preset,
    customWidth: raw.customWidth as number,
    customHeight: raw.customHeight as number,
    framing: raw.framing,
    format: raw.format as ProfileFormat,
    quality: raw.quality as number,
  };
}

/** A user-facing profile name: trimmed, 1–60 characters, no control characters. */
export function cleanProfileName(name: string): string | null {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.length >= 1 && cleaned.length <= MAX_PROFILE_NAME ? cleaned : null;
}

function parseUserProfile(raw: unknown): ExportProfile | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !/^user:[A-Za-z0-9_-]{1,40}$/.test(raw.id)) return null;
  const name = typeof raw.name === "string" ? cleanProfileName(raw.name) : null;
  const settings = parseSettings(raw.settings);
  return name && settings ? { id: raw.id, name, builtIn: false, settings } : null;
}

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
/** Keyed by the version a migration upgrades from. */
export const MIGRATIONS: Record<number, Migration> = {};

export type LoadResult =
  | { status: "ok"; profiles: ExportProfile[]; dropped: number }
  | { status: "empty" }
  | { status: "unreadable" }
  | { status: "newer"; version: number };

/** Parses the stored document. Invalid profiles are dropped one by one and counted. */
export function parseProfilesDoc(text: string | null, migrations = MIGRATIONS, target = PROFILE_SCHEMA_VERSION): LoadResult {
  if (!text) return { status: "empty" };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { status: "unreadable" };
  }
  if (!isRecord(doc) || !Number.isInteger(doc.schemaVersion) || (doc.schemaVersion as number) < 1) return { status: "unreadable" };
  let version = doc.schemaVersion as number;
  if (version > target) return { status: "newer", version };
  let current = doc;
  while (version < target) {
    const migrate = migrations[version];
    if (!migrate) return { status: "unreadable" };
    current = { ...migrate(current), schemaVersion: ++version };
  }
  if (!Array.isArray(current.profiles)) return { status: "unreadable" };
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const profiles: ExportProfile[] = [];
  for (const raw of current.profiles.slice(0, MAX_USER_PROFILES)) {
    const p = parseUserProfile(raw);
    if (!p || seenIds.has(p.id) || seenNames.has(p.name.toLowerCase())) continue;
    seenIds.add(p.id);
    seenNames.add(p.name.toLowerCase());
    profiles.push(p);
  }
  return { status: "ok", profiles, dropped: current.profiles.length - profiles.length };
}

export function serializeProfiles(profiles: ExportProfile[]): string {
  return JSON.stringify({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profiles: profiles.filter((p) => !p.builtIn).map(({ id, name, settings }) => ({ id, name, settings })),
  });
}

// ── Pure list operations (the hook adds persistence) ────────────────────────

export type ProfileChange = { ok: true; profiles: ExportProfile[]; profile?: ExportProfile } | { ok: false; error: string };

const nameTaken = (profiles: ExportProfile[], name: string, exceptId?: string) =>
  [...BUILT_IN_PROFILES, ...profiles].some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());

export function addProfile(profiles: ExportProfile[], rawName: string, settings: ProfileSettings, newId: string): ProfileChange {
  const name = cleanProfileName(rawName);
  if (!name) return { ok: false, error: `Give the profile a name of 1–${MAX_PROFILE_NAME} characters.` };
  if (nameTaken(profiles, name)) return { ok: false, error: `A profile called “${name}” already exists.` };
  if (profiles.length >= MAX_USER_PROFILES) return { ok: false, error: `You can keep up to ${MAX_USER_PROFILES} profiles. Delete one first.` };
  const clean = parseSettings(settings);
  if (!clean) return { ok: false, error: "These settings can't be saved as a profile." };
  const profile: ExportProfile = { id: `user:${newId}`, name, builtIn: false, settings: clean };
  return { ok: true, profiles: [...profiles, profile], profile };
}

export function renameProfile(profiles: ExportProfile[], id: string, rawName: string): ProfileChange {
  const target = profiles.find((p) => p.id === id);
  if (!target) return { ok: false, error: "Built-in profiles can't be renamed." };
  const name = cleanProfileName(rawName);
  if (!name) return { ok: false, error: `Give the profile a name of 1–${MAX_PROFILE_NAME} characters.` };
  if (nameTaken(profiles, name, id)) return { ok: false, error: `A profile called “${name}” already exists.` };
  return { ok: true, profiles: profiles.map((p) => (p.id === id ? { ...p, name } : p)) };
}

export function deleteProfile(profiles: ExportProfile[], id: string): ProfileChange {
  if (!profiles.some((p) => p.id === id)) return { ok: false, error: "Built-in profiles can't be deleted." };
  return { ok: true, profiles: profiles.filter((p) => p.id !== id) };
}
