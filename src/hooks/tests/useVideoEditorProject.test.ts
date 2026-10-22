import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useVideoEditor } from "../useVideoEditor";
import { exportVideo } from "@/lib/ffmpeg";
import { loadSessionFile, clearSessionFile, saveSessionFile } from "@/lib/sessionDB";
import {
  PROJECT_STORAGE_KEY,
  createProjectDocument,
  serializeProject,
  toEditState,
  type SourceInfo,
} from "@/lib/project";
import { DEFAULT_RECIPE } from "@/lib/constants";
import { RECIPE_STORAGE_KEY } from "@/lib/editorPersistence";

vi.mock("@/lib/ffmpeg", () => ({
  loadFFmpeg: vi.fn().mockResolvedValue(true),
  exportVideo: vi.fn().mockResolvedValue({ blobUrl: "blob:out", size: 1, width: 1, height: 1 }),
  terminateFFmpeg: vi.fn(),
  formatBytes: (n: number) => `${n} B`,
  FFmpegLoadError: class extends Error {},
}));

vi.mock("@/lib/sessionDB", () => ({
  saveSessionFile: vi.fn().mockResolvedValue(undefined),
  loadSessionFile: vi.fn().mockResolvedValue(null),
  clearSessionFile: vi.fn().mockResolvedValue(undefined),
}));

const VIDEO_META = { width: 1920, height: 1080, duration: 30 };

// jsdom can't decode video, so metadata loads are simulated.
Object.defineProperty(HTMLMediaElement.prototype, "src", {
  configurable: true,
  get: () => "",
  set(this: HTMLVideoElement) {
    setTimeout(() => this.onloadedmetadata?.(new Event("loadedmetadata")), 0);
  },
});
Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => VIDEO_META.width });
Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => VIDEO_META.height });
Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => VIDEO_META.duration });
URL.createObjectURL = vi.fn(() => "blob:test");
URL.revokeObjectURL = vi.fn();

function videoFile(name = "clip.mp4", padding = 100): File {
  // "....ftypisom" — passes the MP4 magic-byte check.
  const header = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  return new File([header, new Uint8Array(padding)], name, { type: "video/mp4", lastModified: 1 });
}

function sourceOf(file: File): SourceInfo {
  return { name: file.name, size: file.size, type: file.type, lastModified: 1, ...VIDEO_META };
}

function savedProject(file: File) {
  const edit = toEditState({ ...DEFAULT_RECIPE, preset: "square-1-1", trimStart: 4, trimEnd: 12, rotate: 90 });
  return createProjectDocument(
    { ...edit, imageOverlay: { position: "top-left", size: 250, opacity: 60 } },
    sourceOf(file),
    new Date(5_000)
  );
}

async function openVideo(result: { current: ReturnType<typeof useVideoEditor> }, file = videoFile()) {
  act(() => result.current.handleFileSelect(file));
  await waitFor(() => expect(result.current.file).toBe(file));
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.mocked(loadSessionFile).mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("undo/redo in the editor", () => {
  it("restores mixed edits and exports exactly what is shown", async () => {
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.updateRecipe({ rotate: 90 }));
    act(() => result.current.setOverlayPosition("top-left"));
    act(() => result.current.updateRecipe({ format: "gif" }));
    expect(result.current.recipe.keepAudio).toBe(false);

    act(() => result.current.undo());
    expect(result.current.recipe.format).toBe("mp4");
    expect(result.current.recipe.keepAudio).toBe(true);
    act(() => result.current.undo());
    expect(result.current.overlayPosition).toBe("bottom-right");
    expect(result.current.canRedo).toBe(true);

    await act(() => result.current.handleExport());
    const [, exportedRecipe, , , , overlayOptions] = vi.mocked(exportVideo).mock.calls[0]!;
    expect(exportedRecipe).toEqual(result.current.recipe);
    expect(exportedRecipe).toMatchObject({ rotate: 90, format: "mp4", keepAudio: true });
    expect(overlayOptions).toMatchObject({ position: "bottom-right" });

    act(() => result.current.redo());
    act(() => result.current.redo());
    expect(result.current.recipe.format).toBe("gif");
    expect(result.current.canRedo).toBe(false);
  });

  it("turns one slider drag into one undo step", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);

    for (let i = 1; i <= 50; i++) {
      vi.setSystemTime(10_000 + i * 16);
      act(() => result.current.updateRecipe({ brightness: i / 100 }));
    }
    act(() => result.current.undo());
    expect(result.current.recipe.brightness).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });

  it("keeps the completion-sound preference out of history", async () => {
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    act(() => result.current.toggleSound());
    expect(result.current.recipe.soundOnCompletion).toBe(true);
    expect(result.current.canUndo).toBe(false);
  });

  it("makes reset-settings undoable without deleting saved data", async () => {
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    act(() => result.current.updateRecipe({ speed: 2, rotate: 180 }));
    act(() => result.current.resetSettings());
    expect(result.current.recipe.speed).toBe(1);
    expect(clearSessionFile).not.toHaveBeenCalled();
    act(() => result.current.undo());
    expect(result.current.recipe).toMatchObject({ speed: 2, rotate: 180 });
  });

  it("blocks undo while an export is running", async () => {
    let finish!: (v: unknown) => void;
    vi.mocked(exportVideo).mockImplementationOnce(() => new Promise((r) => (finish = r)) as never);
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    act(() => result.current.updateRecipe({ rotate: 90 }));

    let exporting!: Promise<void>;
    act(() => {
      exporting = result.current.handleExport();
    });
    await waitFor(() => expect(result.current.status).toBe("exporting"));
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.undo());
    expect(result.current.recipe.rotate).toBe(90);

    await act(async () => {
      finish({ blobUrl: "blob:x", size: 1, width: 1, height: 1 });
      await exporting;
    });
    expect(result.current.canUndo).toBe(true);
  });

  it("starts a fresh history for a new video", async () => {
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    act(() => result.current.updateRecipe({ rotate: 90 }));
    await openVideo(result, videoFile("second.mp4"));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.recipe.rotate).toBe(90);
  });
});

describe("project recovery", () => {
  it("restores edits and the stored video copy after a refresh", async () => {
    const file = videoFile();
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(savedProject(file)));
    vi.mocked(loadSessionFile).mockResolvedValue(file);

    const { result } = renderHook(() => useVideoEditor());
    await waitFor(() => expect(result.current.file).toBe(file));
    expect(result.current.recipe).toMatchObject({ preset: "square-1-1", trimStart: 4, trimEnd: 12, rotate: 90 });
    expect(result.current.overlayPosition).toBe("top-left");
    expect(result.current.recovery).toBeNull();
    expect(result.current.canUndo).toBe(false);
  });

  it("asks for the video when the stored copy is gone, then resumes with trims intact", async () => {
    const file = videoFile();
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(savedProject(file)));

    const { result } = renderHook(() => useVideoEditor());
    await waitFor(() => expect(result.current.recovery?.source.name).toBe("clip.mp4"));
    expect(result.current.file).toBeNull();

    await openVideo(result, file);
    expect(result.current.recovery).toBeNull();
    expect(result.current.recipe).toMatchObject({ trimStart: 4, trimEnd: 12, rotate: 90 });
  });

  it("treats reading the stored copy failing like a missing file", async () => {
    const file = videoFile();
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(savedProject(file)));
    vi.mocked(loadSessionFile).mockRejectedValue(new Error("IndexedDB blocked"));
    const { result } = renderHook(() => useVideoEditor());
    await waitFor(() => expect(result.current.recovery).not.toBeNull());
  });

  it("starts fresh trims when a different video is chosen", async () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(savedProject(videoFile())));
    const { result } = renderHook(() => useVideoEditor());
    await waitFor(() => expect(result.current.recovery).not.toBeNull());

    await openVideo(result, videoFile("other.mp4", 5));
    expect(result.current.recipe).toMatchObject({ trimStart: 0, trimEnd: null, rotate: 90 });
    expect(result.current.recovery).toBeNull();
  });

  it("can discard a saved project whose video is gone", async () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(savedProject(videoFile())));
    const { result } = renderHook(() => useVideoEditor());
    await waitFor(() => expect(result.current.recovery).not.toBeNull());
    act(() => result.current.discardRecovery());
    expect(result.current.recovery).toBeNull();
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBeNull();
    expect(result.current.recipe.rotate).toBe(0);
  });

  it("flushes the latest edit when the page is hidden mid-debounce", async () => {
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    act(() => result.current.updateRecipe({ rotate: 270 }));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    const stored = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY)!);
    expect(stored.edit.recipe.rotate).toBe(270);
    expect(stored.source.name).toBe("clip.mp4");
    // Never the video itself.
    expect(JSON.stringify(stored).length).toBeLessThan(4_000);
    expect(saveSessionFile).toHaveBeenCalledTimes(1);
  });

  it("reports when edits can't be saved in this browser", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key) => {
      if (key === PROJECT_STORAGE_KEY) throw new DOMException("full", "QuotaExceededError");
    });
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    act(() => result.current.updateRecipe({ rotate: 90 }));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(result.current.storageStatus.error).toContain("Save project file");
    setItem.mockRestore();
  });

  it("reports when the video copy can't be stored", async () => {
    vi.mocked(saveSessionFile).mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    await waitFor(() => expect(result.current.storageStatus.sourceCopy).toBe("failed"));
  });

  it("deletes everything it saved and resets the editor", async () => {
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    act(() => result.current.updateRecipe({ rotate: 90 }));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).not.toBeNull();

    act(() => result.current.deleteSavedData());
    expect(result.current.file).toBeNull();
    expect(result.current.recipe.rotate).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(RECIPE_STORAGE_KEY)).toBeNull();
    expect(clearSessionFile).toHaveBeenCalled();
    // The settings autosave must not write the defaults straight back.
    await new Promise((r) => setTimeout(r, 600));
    expect(localStorage.getItem(RECIPE_STORAGE_KEY)).toBeNull();
  });
});

describe("project files", () => {
  it("rejects a malformed project and leaves the edits alone", async () => {
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    act(() => result.current.updateRecipe({ rotate: 90 }));
    let outcome!: ReturnType<typeof result.current.importProjectFile>;
    act(() => {
      outcome = result.current.importProjectFile('{"format":"reframe-project","schemaVersion":1,"edit":{}}');
    });
    expect(outcome.ok).toBe(false);
    expect(result.current.recipe.rotate).toBe(90);
  });

  it("applies an imported project as one undoable step", async () => {
    const { result } = renderHook(() => useVideoEditor());
    const file = await openVideo(result);
    const json = serializeProject(savedProject(file));
    let outcome!: ReturnType<typeof result.current.importProjectFile>;
    act(() => {
      outcome = result.current.importProjectFile(json);
    });
    expect(outcome).toEqual({ ok: true, message: "Project opened and applied to this video." });
    expect(result.current.recipe).toMatchObject({ preset: "square-1-1", trimStart: 4 });
    act(() => result.current.undo());
    expect(result.current.recipe.trimStart).toBe(0);
  });

  it("holds an imported project until its video is chosen", async () => {
    const { result } = renderHook(() => useVideoEditor());
    await waitFor(() => expect(loadSessionFile).toHaveBeenCalled());
    const file = videoFile();
    act(() => {
      result.current.importProjectFile(serializeProject(savedProject(file)));
    });
    expect(result.current.recovery).toMatchObject({ origin: "imported", source: { name: "clip.mp4" } });
    await openVideo(result, file);
    expect(result.current.recipe).toMatchObject({ trimStart: 4, trimEnd: 12 });
  });

  it("exports the current edits and source description without media", async () => {
    const { result } = renderHook(() => useVideoEditor());
    await openVideo(result);
    act(() => result.current.updateRecipe({ rotate: 180 }));
    const { fileName, contents } = result.current.buildProjectFile();
    expect(fileName).toBe("clip.reframe.json");
    const doc = JSON.parse(contents);
    expect(doc).toMatchObject({ format: "reframe-project", schemaVersion: 1, source: { name: "clip.mp4" } });
    expect(doc.edit.recipe.rotate).toBe(180);
    expect(Object.keys(doc).sort()).toEqual(["edit", "format", "savedAt", "schemaVersion", "source"]);
  });
});
