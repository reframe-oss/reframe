import { describe, it, expect, vi } from "vitest";
import {
  MAX_PROJECT_FILE_BYTES,
  MAX_TEXT_OVERLAYS,
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  PROJECT_STORAGE_KEY,
  createProjectDocument,
  fitEditToDuration,
  loadProjectRecord,
  matchesSource,
  migrateProjectDocument,
  parseProject,
  projectFileName,
  saveProjectRecord,
  serializeProject,
  toEditState,
  type SourceInfo,
} from "@/lib/project";
import { DEFAULT_RECIPE } from "@/lib/constants";
import { createDefaultTextOverlay } from "@/lib/text-overlay";
import type { EditState } from "@/lib/editHistory";

const source: SourceInfo = {
  name: "holiday clip.mp4",
  size: 24_000_000,
  type: "video/mp4",
  lastModified: 1_700_000_000_000,
  duration: 42.5,
  width: 1920,
  height: 1080,
};

function sampleEdit(): EditState {
  const overlay = { ...createDefaultTextOverlay(), text: "Day one", x: 30 };
  return {
    recipe: {
      ...toEditState(DEFAULT_RECIPE).recipe,
      preset: "square-1-1",
      trimStart: 3,
      trimEnd: 20,
      rotate: 90,
      brightness: 0.2,
      format: "webm",
      textOverlays: [overlay],
    },
    imageOverlay: { position: "top-left", size: 250, opacity: 60 },
  };
}

function sampleJson(mutate?: (doc: any) => void): string {
  const doc = JSON.parse(serializeProject(createProjectDocument(sampleEdit(), source, new Date(0))));
  mutate?.(doc);
  return JSON.stringify(doc);
}

function memoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete store[k];
    }),
  };
}

describe("project documents", () => {
  it("round-trips the edit state and source without any media", () => {
    const json = sampleJson();
    expect(json.length).toBeLessThan(4_000);
    const parsed = parseProject(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.project.edit).toEqual(JSON.parse(json).edit);
    expect(parsed.project.source).toEqual(source);
    expect(parsed.project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.migratedFrom).toBeNull();
    expect(JSON.parse(json)).not.toHaveProperty("edit.recipe.soundOnCompletion");
  });

  it("never writes or reads a font file path", () => {
    const edit = sampleEdit();
    edit.recipe.textOverlays[0]!.fontPath = "blob:http://localhost/abc";
    const doc = createProjectDocument(edit, source, new Date(0));
    expect(doc.edit.recipe.textOverlays[0]).not.toHaveProperty("fontPath");

    const parsed = parseProject(
      sampleJson((d) => {
        d.edit.recipe.textOverlays[0].fontPath = "/etc/passwd':enable=1";
      })
    );
    expect(parsed.ok && parsed.project.edit.recipe.textOverlays[0]).not.toHaveProperty("fontPath");
  });

  it.each([
    ["not JSON", "{nope", "not valid JSON"],
    ["a JSON array", "[]", "not a Reframe project"],
    ["another app's JSON", JSON.stringify({ format: "other", schemaVersion: 1 }), "not a Reframe project"],
    ["no schema version", sampleJson((d) => delete d.schemaVersion), "no valid schema version"],
    ["a fractional version", sampleJson((d) => (d.schemaVersion = 1.5)), "no valid schema version"],
    ["no edit settings", sampleJson((d) => delete d.edit), "no edit settings"],
    ["an unknown preset", sampleJson((d) => (d.edit.recipe.preset = "x")), "preset"],
    ["brightness out of range", sampleJson((d) => (d.edit.recipe.brightness = 7)), "brightness"],
    ["a string number", sampleJson((d) => (d.edit.recipe.quality = "23")), "quality"],
    ["a null number", sampleJson((d) => (d.edit.recipe.contrast = null)), "contrast"],
    ["an unsupported speed", sampleJson((d) => (d.edit.recipe.speed = 3)), "speed"],
    ["an unknown format", sampleJson((d) => (d.edit.recipe.format = "exe")), "format"],
    ["trim end before start", sampleJson((d) => (d.edit.recipe.trimEnd = 1)), "trim end"],
    ["a missing field", sampleJson((d) => delete d.edit.recipe.keepAudio), "keepAudio"],
    ["an old recipe version", sampleJson((d) => (d.edit.recipe.version = 0)), "unsupported version"],
    ["an unsafe font name", sampleJson((d) => (d.edit.recipe.textOverlays[0].fontFamily = "x':fontfile=/x")), "font name"],
    ["a bad colour", sampleJson((d) => (d.edit.recipe.textOverlays[0].color = "red")), "colour"],
    ["an unsafe overlay id", sampleJson((d) => (d.edit.recipe.textOverlays[0].id = "<img>")), "invalid id"],
    ["overlay text too long", sampleJson((d) => (d.edit.recipe.textOverlays[0].text = "x".repeat(501))), "at most 500"],
    ["duplicate overlay ids", sampleJson((d) => d.edit.recipe.textOverlays.push(d.edit.recipe.textOverlays[0])), "same id"],
    ["a bad overlay position", sampleJson((d) => (d.edit.imageOverlay.position = "middle")), "position"],
    ["a bad source", sampleJson((d) => (d.source = { name: "" })), "source video name"],
  ])("rejects %s", (_label, input, message) => {
    const parsed = parseProject(input);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(message);
  });

  it("rejects too many text overlays", () => {
    const parsed = parseProject(
      sampleJson((d) => {
        const one = d.edit.recipe.textOverlays[0];
        d.edit.recipe.textOverlays = Array.from({ length: MAX_TEXT_OVERLAYS + 1 }, (_, i) => ({ ...one, id: `t${i}` }));
      })
    );
    expect(parsed.ok).toBe(false);
  });

  it("rejects oversized input before parsing it", () => {
    const parse = vi.spyOn(JSON, "parse");
    const parsed = parseProject(" ".repeat(MAX_PROJECT_FILE_BYTES + 1));
    expect(parsed.ok).toBe(false);
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("ignores unknown keys, including __proto__, instead of copying them", () => {
    const json = sampleJson().replace(
      '"recipe": {',
      '"recipe": { "__proto__": { "polluted": true }, "constructor": 1, "extra": "x",'
    );
    const parsed = parseProject(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.project.edit.recipe).not.toHaveProperty("extra");
    expect(Object.getPrototypeOf(parsed.project.edit.recipe)).toBe(Object.prototype);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("accepts a project with no source and an unreadable savedAt", () => {
    const parsed = parseProject(sampleJson((d) => ((d.source = null), (d.savedAt = "soon"))));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.project.source).toBeNull();
      expect(parsed.project.savedAt).toBe(new Date(0).toISOString());
    }
  });
});

describe("schema migration", () => {
  it("upgrades step by step through the migration table", () => {
    // Simulates a future v3 that renamed imageOverlay → logo in v2 and back.
    const migrations = {
      1: vi.fn((doc: any) => ({ ...doc, edit: { ...doc.edit, logo: doc.edit.imageOverlay } })),
      2: vi.fn((doc: any) => {
        const { logo, ...edit } = doc.edit;
        return { ...doc, edit: { ...edit, imageOverlay: logo } };
      }),
    };
    const parsed = parseProject(sampleJson(), migrations, 3);
    expect(migrations[1]).toHaveBeenCalledTimes(1);
    expect(migrations[2]).toHaveBeenCalledTimes(1);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.migratedFrom).toBe(1);
      expect(parsed.project.schemaVersion).toBe(3);
      expect(parsed.project.edit.imageOverlay.position).toBe("top-left");
    }
  });

  it("refuses projects from a newer version with a clear message", () => {
    const parsed = parseProject(sampleJson((d) => (d.schemaVersion = PROJECT_SCHEMA_VERSION + 1)));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("newer version of Reframe");
  });

  it("refuses a version with no migration path", () => {
    expect(() => migrateProjectDocument({ format: PROJECT_FORMAT, schemaVersion: 1 }, {}, 2)).toThrow(
      "can no longer be opened"
    );
  });

  it("validates the migrated result, not just the input", () => {
    const parsed = parseProject(sampleJson(), { 1: (doc) => ({ ...doc, edit: null }) }, 2);
    expect(parsed.ok).toBe(false);
  });
});

describe("session record storage", () => {
  it("saves and loads the current project", () => {
    const storage = memoryStorage();
    const doc = createProjectDocument(sampleEdit(), source, new Date(1_000));
    expect(saveProjectRecord(storage, doc)).toBe(true);
    expect(loadProjectRecord(storage)).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it("reports a failed write instead of throwing (quota, private mode)", () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveProjectRecord(storage, createProjectDocument(sampleEdit(), source, new Date()))).toBe(false);
  });

  it("returns nothing when storage can't be read", () => {
    const storage = memoryStorage();
    storage.getItem.mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loadProjectRecord(storage)).toBeNull();
  });

  it("discards a corrupted or half-written record", () => {
    const storage = memoryStorage({ [PROJECT_STORAGE_KEY]: '{"format":"reframe-project","sche' });
    expect(loadProjectRecord(storage)).toBeNull();
    expect(storage.store[PROJECT_STORAGE_KEY]).toBeUndefined();
  });
});

describe("source matching and fitting", () => {
  it("matches the same file by name and size, ignoring lastModified", () => {
    expect(matchesSource(source, { name: source.name, size: source.size })).toBe(true);
    expect(matchesSource(source, { name: source.name, size: source.size + 1 })).toBe(false);
    expect(matchesSource(source, { name: "other.mp4", size: source.size })).toBe(false);
  });

  it("drops trim points that don't fit a shorter video", () => {
    const edit = sampleEdit();
    expect(fitEditToDuration(edit, 60)).toBe(edit);
    expect(fitEditToDuration(edit, 10).recipe).toMatchObject({ trimStart: 3, trimEnd: null });
    expect(fitEditToDuration(edit, 2).recipe).toMatchObject({ trimStart: 0, trimEnd: null });
    expect(fitEditToDuration(edit, 0)).toBe(edit);
  });

  it("builds a safe file name", () => {
    expect(projectFileName(source)).toBe("holiday clip.reframe.json");
    expect(projectFileName({ ...source, name: "../../<x>.mov" })).toBe("x.reframe.json");
    expect(projectFileName(null)).toBe("untitled.reframe.json");
  });
});
