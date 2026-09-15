import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_RECIPE } from "@/lib/constants";
import {
  EDITOR_STATE_KEY,
  LEGACY_SETTINGS_KEY,
  RECIPE_STORAGE_KEY,
  loadOverlayState,
  loadPersistedRecipe,
  persistOverlayState,
  persistRecipe,
  persistSoundPreference,
} from "@/lib/editorPersistence";
import { EditRecipe } from "@/lib/types";

describe("editorPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads the canonical recipe key first", () => {
    const recipe: EditRecipe = { ...DEFAULT_RECIPE, quality: 28, version: DEFAULT_RECIPE.version };
    localStorage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(recipe));
    localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify({ quality: 18 }));

    expect(loadPersistedRecipe(localStorage, DEFAULT_RECIPE)).toEqual(recipe);
  });

  it("migrates legacy settings when the canonical key is missing", () => {
    localStorage.setItem(
      LEGACY_SETTINGS_KEY,
      JSON.stringify({ preset: "custom", quality: 19, speed: 1.5, customWidth: 1280, customHeight: 720 })
    );

    const loaded = loadPersistedRecipe(localStorage, DEFAULT_RECIPE);

    expect(loaded.preset).toBe("custom");
    expect(loaded.quality).toBe(19);
    expect(loaded.speed).toBe(1.5);
    expect(loaded.customWidth).toBe(1280);
    expect(loaded.customHeight).toBe(720);
  });

  it("persists only the canonical recipe key and clears legacy recipe settings", () => {
    persistRecipe(localStorage, DEFAULT_RECIPE);

    expect(localStorage.getItem(RECIPE_STORAGE_KEY)).toBe(JSON.stringify(DEFAULT_RECIPE));
    expect(localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
  });

  it("persists overlay state without recipe data", () => {
    persistOverlayState(localStorage, {
      overlayPosition: "top-left",
      overlaySize: 120,
      overlayOpacity: 85,
    });

    expect(JSON.parse(localStorage.getItem(EDITOR_STATE_KEY) ?? "{}")).toEqual({
      overlayPosition: "top-left",
      overlaySize: 120,
      overlayOpacity: 85,
    });
  });

  it("reads overlay state while ignoring any legacy embedded recipe", () => {
    localStorage.setItem(
      EDITOR_STATE_KEY,
      JSON.stringify({
        recipe: { quality: 12 },
        overlayPosition: "bottom-left",
        overlaySize: 155,
        overlayOpacity: 72,
      })
    );

    expect(loadOverlayState(localStorage, {
      overlayPosition: "bottom-right",
      overlaySize: 150,
      overlayOpacity: 100,
    })).toEqual({
      overlayPosition: "bottom-left",
      overlaySize: 155,
      overlayOpacity: 72,
    });
  });

  it("persists sound preference separately", () => {
    persistSoundPreference(localStorage, true);
    expect(localStorage.getItem("soundOnCompletion")).toBe("true");
  });
});
