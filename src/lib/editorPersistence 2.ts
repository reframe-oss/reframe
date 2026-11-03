import { DEFAULT_RECIPE } from "@/lib/constants";
import { EditRecipe, OverlayPosition, isValidRecipe, TextOverlay } from "@/lib/types";
import { generateTextOverlayId } from "@/lib/text-overlay";

export const RECIPE_STORAGE_KEY = "reframe:recipe";
export const LEGACY_SETTINGS_KEY = "reframe-settings";
export const EDITOR_STATE_KEY = "editorState";
export const SOUND_PREF_KEY = "soundOnCompletion";

export interface OverlayEditorState {
  overlayPosition?: OverlayPosition;
  overlaySize?: number;
  overlayOpacity?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const VALID_FONT_WEIGHTS = ["normal", "bold", "900"];

function sanitizeTextOverlay(overlay: any): TextOverlay {
  return {
    id: typeof overlay.id === "string" ? overlay.id : generateTextOverlayId(),
    text: typeof overlay.text === "string" ? overlay.text.slice(0, 500) : "",
    x: typeof overlay.x === "number" && isFinite(overlay.x) ? clamp(overlay.x, 0, 100) : 50,
    y: typeof overlay.y === "number" && isFinite(overlay.y) ? clamp(overlay.y, 0, 100) : 20,
    fontSize: typeof overlay.fontSize === "number" && isFinite(overlay.fontSize) ? clamp(overlay.fontSize, 12, 120) : 48,
    color: typeof overlay.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(overlay.color) ? overlay.color : "#ffffff",
    fontWeight: VALID_FONT_WEIGHTS.includes(overlay.fontWeight) ? (overlay.fontWeight as "normal" | "bold" | "900") : "normal",
    fontFamily: typeof overlay.fontFamily === "string" ? overlay.fontFamily : "Arial",
    fontPath: typeof overlay.fontPath === "string" ? overlay.fontPath : undefined,
  };
}

export function migrateRecipe(recipe: Partial<EditRecipe>): EditRecipe {
  const rotateValue = [0, 90, 180, 270].includes(recipe.rotate as any) ? (recipe.rotate as 0 | 90 | 180 | 270) : DEFAULT_RECIPE.rotate;

  return {
    ...DEFAULT_RECIPE,
    ...recipe,
    quality: typeof recipe.quality === "number" ? clamp(recipe.quality, 18, 30) : DEFAULT_RECIPE.quality,
    speed: typeof recipe.speed === "number" ? clamp(recipe.speed, 0.25, 4) : DEFAULT_RECIPE.speed,
    brightness: typeof recipe.brightness === "number" ? clamp(recipe.brightness, -1, 1) : DEFAULT_RECIPE.brightness,
    contrast: typeof recipe.contrast === "number" ? clamp(recipe.contrast, 0, 2) : DEFAULT_RECIPE.contrast,
    saturation: typeof recipe.saturation === "number" ? clamp(recipe.saturation, 0, 3) : DEFAULT_RECIPE.saturation,
    customWidth: typeof recipe.customWidth === "number" ? clamp(recipe.customWidth, 16, 7680) : DEFAULT_RECIPE.customWidth,
    customHeight: typeof recipe.customHeight === "number" ? clamp(recipe.customHeight, 16, 7680) : DEFAULT_RECIPE.customHeight,
    trimStart: typeof recipe.trimStart === "number" ? Math.max(0, recipe.trimStart) : DEFAULT_RECIPE.trimStart,
    rotate: rotateValue,
    textOverlays: Array.isArray(recipe.textOverlays) ? recipe.textOverlays.map(sanitizeTextOverlay) : [],
  };
}

export function getStoredSoundPreference(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(SOUND_PREF_KEY) === "true";
}

export function loadPersistedRecipe(
  storage: Pick<Storage, "getItem">,
  fallback: EditRecipe
): EditRecipe {
  const raw = storage.getItem(RECIPE_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isValidRecipe(parsed)) {
        return parsed;
      }
    } catch {
      // fall through to legacy state
    }
  }

  const legacy = storage.getItem(LEGACY_SETTINGS_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy);
      return migrateRecipe({
        preset: parsed.preset ?? fallback.preset,
        quality: parsed.quality ?? fallback.quality,
        speed: parsed.speed ?? fallback.speed,
        customWidth: Number.isFinite(Number(parsed.customWidth)) ? Number(parsed.customWidth) : fallback.customWidth,
        customHeight: Number.isFinite(Number(parsed.customHeight)) ? Number(parsed.customHeight) : fallback.customHeight,
      });
    } catch {
      // ignore malformed legacy data
    }
  }

  return fallback;
}

export function loadOverlayState(
  storage: Pick<Storage, "getItem">,
  fallback: OverlayEditorState
): OverlayEditorState {
  const raw = storage.getItem(EDITOR_STATE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as OverlayEditorState & { recipe?: unknown };
    return {
      overlayPosition: typeof parsed.overlayPosition === "string" ? parsed.overlayPosition : fallback.overlayPosition,
      overlaySize: typeof parsed.overlaySize === "number" ? parsed.overlaySize : fallback.overlaySize,
      overlayOpacity: typeof parsed.overlayOpacity === "number" ? parsed.overlayOpacity : fallback.overlayOpacity,
    };
  } catch {
    return fallback;
  }
}

export function persistRecipe(storage: Pick<Storage, "setItem" | "removeItem">, recipe: EditRecipe) {
  storage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(recipe));
  storage.removeItem(LEGACY_SETTINGS_KEY);
}

export function persistSoundPreference(storage: Pick<Storage, "setItem">, soundOnCompletion: boolean) {
  storage.setItem(SOUND_PREF_KEY, String(soundOnCompletion));
}

export function persistOverlayState(storage: Pick<Storage, "setItem">, overlay: OverlayEditorState) {
  storage.setItem(
    EDITOR_STATE_KEY,
    JSON.stringify({
      overlayPosition: overlay.overlayPosition,
      overlaySize: overlay.overlaySize,
      overlayOpacity: overlay.overlayOpacity,
    })
  );
}
