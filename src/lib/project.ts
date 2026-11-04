/**
 * Reframe project documents: the serialisable edit state plus a description of
 * the source video, used for the on-device session record and for the
 * explicit "Save project file" / "Open project file" JSON.
 *
 * A project never contains media. The source is identified by name, size and
 * duration so it can be matched when the user picks the file again.
 *
 * Schema changes: bump PROJECT_SCHEMA_VERSION and add an entry to MIGRATIONS
 * that upgrades a document from the previous version. Every document, stored
 * or imported, is migrated to the current version and then validated in full.
 */
import { DEFAULT_RECIPE, SPEED_STEPS } from "./constants";
import { PRESETS } from "./presets";
import { RECIPE_VERSION, type OverlayPosition, type TextOverlay } from "./types";
import type { EditState, ImageOverlaySettings } from "./editHistory";

export const PROJECT_FORMAT = "reframe-project";
export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_STORAGE_KEY = "reframe:project";
/** Projects are a few KB; anything this large is not one of ours. */
export const MAX_PROJECT_FILE_BYTES = 512 * 1024;
export const MAX_TEXT_OVERLAYS = 50;
export const MAX_OVERLAY_TEXT_LENGTH = 500;

export const DEFAULT_IMAGE_OVERLAY: ImageOverlaySettings = {
  position: "bottom-right",
  size: 150,
  opacity: 100,
};

export interface SourceInfo {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  duration: number;
  width: number;
  height: number;
}

export interface ProjectDocument {
  format: typeof PROJECT_FORMAT;
  schemaVersion: number;
  savedAt: string;
  source: SourceInfo | null;
  edit: EditState;
}

export type ParseResult =
  | { ok: true; project: ProjectDocument; migratedFrom: number | null }
  | { ok: false; error: string };

type RawDocument = Record<string, unknown>;
export type Migration = (doc: RawDocument) => RawDocument;

/** Keyed by the version a migration upgrades *from*. */
export const MIGRATIONS: Record<number, Migration> = {};

class ProjectError extends Error {}

function fail(message: string): never {
  throw new ProjectError(message);
}

function isRecord(value: unknown): value is RawDocument {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(obj: RawDocument, key: string, min: number, max: number, label = key): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(`“${label}” must be a number from ${min} to ${max}.`);
  }
  return value;
}

function bool(obj: RawDocument, key: string): boolean {
  if (typeof obj[key] !== "boolean") fail(`“${key}” must be true or false.`);
  return obj[key] as boolean;
}

function oneOf<T>(obj: RawDocument, key: string, allowed: readonly T[]): T {
  if (!allowed.includes(obj[key] as T)) fail(`“${key}” has an unsupported value.`);
  return obj[key] as T;
}

const OVERLAY_POSITIONS: readonly OverlayPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
// Font names reach the FFmpeg drawtext filter, so only plain names are allowed.
const SAFE_FONT_NAME = /^[A-Za-z0-9 _-]{1,64}$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function parseTextOverlay(raw: unknown, index: number): TextOverlay {
  const label = `text overlay ${index + 1}`;
  if (!isRecord(raw)) fail(`The ${label} is not valid.`);
  if (typeof raw.id !== "string" || !SAFE_ID.test(raw.id)) fail(`The ${label} has an invalid id.`);
  if (typeof raw.text !== "string" || raw.text.length > MAX_OVERLAY_TEXT_LENGTH) {
    fail(`The ${label} text must be at most ${MAX_OVERLAY_TEXT_LENGTH} characters.`);
  }
  if (typeof raw.color !== "string" || !HEX_COLOR.test(raw.color)) {
    fail(`The ${label} colour must be a hex value like #ffffff.`);
  }
  if (raw.fontFamily !== undefined && (typeof raw.fontFamily !== "string" || !SAFE_FONT_NAME.test(raw.fontFamily))) {
    fail(`The ${label} font name is not allowed.`);
  }
  // `fontPath` is deliberately never read: it is passed to FFmpeg as a file
  // path, so a project file must not be able to supply one.
  return {
    id: raw.id,
    text: raw.text,
    x: num(raw, "x", 0, 100, `${label} x`),
    y: num(raw, "y", 0, 100, `${label} y`),
    fontSize: num(raw, "fontSize", 12, 120, `${label} font size`),
    color: raw.color,
    fontWeight: oneOf(raw, "fontWeight", ["normal", "bold", "900"] as const),
    ...(typeof raw.fontFamily === "string" ? { fontFamily: raw.fontFamily } : {}),
  };
}

function parseRecipe(raw: unknown): EditState["recipe"] {
  if (!isRecord(raw)) fail("The project has no edit settings.");
  if (raw.version !== RECIPE_VERSION) fail("The project's edit settings use an unsupported version.");
  if (typeof raw.preset !== "string" || !PRESETS.some((p) => p.id === raw.preset)) {
    fail("“preset” is not a known output size.");
  }
  const trimStart = num(raw, "trimStart", 0, Number.MAX_SAFE_INTEGER);
  let trimEnd: number | null = null;
  if (raw.trimEnd !== null) {
    trimEnd = num(raw, "trimEnd", 0, Number.MAX_SAFE_INTEGER);
    if (trimEnd <= trimStart) fail("The trim end must be after the trim start.");
  }
  if (!Array.isArray(raw.textOverlays)) fail("“textOverlays” must be a list.");
  if (raw.textOverlays.length > MAX_TEXT_OVERLAYS) {
    fail(`A project can have at most ${MAX_TEXT_OVERLAYS} text overlays.`);
  }
  const textOverlays = raw.textOverlays.map(parseTextOverlay);
  if (new Set(textOverlays.map((o) => o.id)).size !== textOverlays.length) {
    fail("Two text overlays share the same id.");
  }

  return {
    preset: raw.preset,
    customWidth: Math.round(num(raw, "customWidth", 16, 7680)),
    customHeight: Math.round(num(raw, "customHeight", 16, 7680)),
    framing: oneOf(raw, "framing", ["fit", "fill"] as const),
    trimStart,
    trimEnd,
    rotate: oneOf(raw, "rotate", [0, 90, 180, 270] as const),
    keepAudio: bool(raw, "keepAudio"),
    normalizeAudio: bool(raw, "normalizeAudio"),
    speed: oneOf(raw, "speed", SPEED_STEPS),
    volume: num(raw, "volume", 0, 200),
    quality: num(raw, "quality", 18, 30),
    format: oneOf(raw, "format", ["mp4", "webm", "mkv", "gif"] as const),
    stabilization: bool(raw, "stabilization"),
    denoise: bool(raw, "denoise"),
    brightness: num(raw, "brightness", -1, 1),
    contrast: num(raw, "contrast", 0, 2),
    saturation: num(raw, "saturation", 0, 3),
    sharpness: num(raw, "sharpness", 0, 3),
    textOverlays,
    version: RECIPE_VERSION,
  };
}

function parseImageOverlay(raw: unknown): ImageOverlaySettings {
  if (!isRecord(raw)) fail("The project has no image overlay settings.");
  return {
    position: oneOf(raw, "position", OVERLAY_POSITIONS),
    size: Math.round(num(raw, "size", 10, 2000, "image overlay size")),
    opacity: num(raw, "opacity", 0, 100, "image overlay opacity"),
  };
}

function parseSource(raw: unknown): SourceInfo | null {
  if (raw === null) return null;
  if (!isRecord(raw)) fail("The source video description is not valid.");
  if (typeof raw.name !== "string" || raw.name.length === 0 || raw.name.length > 255) {
    fail("The source video name is not valid.");
  }
  if (typeof raw.type !== "string" || raw.type.length > 100) fail("The source video type is not valid.");
  return {
    name: raw.name,
    type: raw.type,
    size: num(raw, "size", 0, Number.MAX_SAFE_INTEGER, "source size"),
    lastModified: num(raw, "lastModified", 0, Number.MAX_SAFE_INTEGER, "source date"),
    duration: num(raw, "duration", 0, Number.MAX_SAFE_INTEGER, "source duration"),
    width: num(raw, "width", 0, 100_000, "source width"),
    height: num(raw, "height", 0, 100_000, "source height"),
  };
}

/** Upgrades a raw document to `target`, one version at a time. */
export function migrateProjectDocument(
  doc: RawDocument,
  migrations: Record<number, Migration> = MIGRATIONS,
  target: number = PROJECT_SCHEMA_VERSION
): RawDocument {
  let version = doc.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    fail("The project file has no valid schema version.");
  }
  if (version > target) {
    fail(
      `This project was saved by a newer version of Reframe (schema ${version}). Reload the page to update, then try again.`
    );
  }
  let current = doc;
  while (version < target) {
    const migrate = migrations[version];
    if (!migrate) fail(`Projects from schema ${version} can no longer be opened.`);
    current = migrate(current);
    version += 1;
    current = { ...current, schemaVersion: version };
  }
  return current;
}

export function parseProject(
  input: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  target: number = PROJECT_SCHEMA_VERSION
): ParseResult {
  try {
    let raw = input;
    if (typeof raw === "string") {
      if (raw.length > MAX_PROJECT_FILE_BYTES) fail("The file is too large to be a Reframe project.");
      try {
        raw = JSON.parse(raw);
      } catch {
        fail("The file is not valid JSON.");
      }
    }
    if (!isRecord(raw) || raw.format !== PROJECT_FORMAT) fail("This file is not a Reframe project.");

    const fromVersion = raw.schemaVersion;
    const doc = migrateProjectDocument(raw, migrations, target);
    if (!isRecord(doc.edit)) fail("The project has no edit settings.");
    const savedAt =
      typeof doc.savedAt === "string" && !Number.isNaN(Date.parse(doc.savedAt))
        ? doc.savedAt
        : new Date(0).toISOString();

    return {
      ok: true,
      migratedFrom: fromVersion === target ? null : (fromVersion as number),
      project: {
        format: PROJECT_FORMAT,
        schemaVersion: target,
        savedAt,
        source: parseSource(doc.source ?? null),
        edit: {
          recipe: parseRecipe(doc.edit.recipe),
          imageOverlay: parseImageOverlay(doc.edit.imageOverlay),
        },
      },
    };
  } catch (err) {
    if (err instanceof ProjectError) return { ok: false, error: err.message };
    return { ok: false, error: "The project file could not be read." };
  }
}

export function createProjectDocument(
  edit: EditState,
  source: SourceInfo | null,
  savedAt: Date
): ProjectDocument {
  return {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    savedAt: savedAt.toISOString(),
    source,
    edit: {
      // Drop anything that only makes sense in this tab (e.g. a blob: font path).
      recipe: {
        ...edit.recipe,
        textOverlays: edit.recipe.textOverlays.map(({ fontPath: _fontPath, ...rest }) => rest),
      },
      imageOverlay: { ...edit.imageOverlay },
    },
  };
}

export function serializeProject(doc: ProjectDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function sourceInfoFromFile(
  file: File,
  meta: { width: number; height: number; duration: number }
): SourceInfo {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
  };
}

/**
 * Same name and byte size. `lastModified` is ignored because copying a file
 * between folders or devices often changes it.
 */
export function matchesSource(source: SourceInfo, file: Pick<File, "name" | "size">): boolean {
  return source.name === file.name && source.size === file.size;
}

/** Keeps trim points inside a video of `duration` seconds. */
export function fitEditToDuration(edit: EditState, duration: number): EditState {
  if (!(duration > 0)) return edit;
  let { trimStart, trimEnd } = edit.recipe;
  if (trimEnd !== null && trimEnd > duration) trimEnd = null;
  if (trimStart >= (trimEnd ?? duration)) trimStart = 0;
  if (trimStart === edit.recipe.trimStart && trimEnd === edit.recipe.trimEnd) return edit;
  return { ...edit, recipe: { ...edit.recipe, trimStart, trimEnd } };
}

export function projectFileName(source: SourceInfo | null): string {
  const base = source?.name.replace(/\.[^.]+$/, "") ?? "untitled";
  const safe = base.replace(/[^A-Za-z0-9 _-]+/g, "").trim().slice(0, 60) || "untitled";
  return `${safe}.reframe.json`;
}

export function toEditState(
  recipe: Partial<EditState["recipe"]> & { soundOnCompletion?: boolean },
  imageOverlay: ImageOverlaySettings = DEFAULT_IMAGE_OVERLAY
): EditState {
  const { soundOnCompletion: _sound, ...rest } = { ...DEFAULT_RECIPE, ...recipe };
  return { recipe: rest, imageOverlay };
}

// ── On-device session record ────────────────────────────────────────────────
// localStorage rather than IndexedDB: the record is a few KB, and a
// synchronous write can be flushed reliably from `pagehide`.

export function saveProjectRecord(storage: Pick<Storage, "setItem">, doc: ProjectDocument): boolean {
  try {
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function loadProjectRecord(storage: Pick<Storage, "getItem" | "removeItem">): ProjectDocument | null {
  let raw: string | null;
  try {
    raw = storage.getItem(PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  const parsed = parseProject(raw);
  if (parsed.ok) return parsed.project;
  try {
    storage.removeItem(PROJECT_STORAGE_KEY);
  } catch {
    // ignore
  }
  return null;
}

export function clearProjectRecord(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(PROJECT_STORAGE_KEY);
}
