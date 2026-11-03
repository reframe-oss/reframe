import { renderHook, act, waitFor, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { useVideoEditor } from "../useVideoEditor";
import { useExportProfiles } from "../useExportProfiles";
import ExportProfiles from "@/components/ExportProfiles";
import { exportVideo } from "@/lib/ffmpeg";
import { BUILT_IN_PROFILES, PROFILE_STORAGE_KEY } from "@/lib/exportProfiles";
import { DEFAULT_RECIPE } from "@/lib/constants";

vi.mock("@/lib/ffmpeg", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ffmpeg")>()),
  loadFFmpeg: vi.fn().mockResolvedValue(undefined),
  exportVideo: vi.fn().mockResolvedValue({ blobUrl: "blob:out", size: 1, width: 1080, height: 1080, format: "mp4", blob: new Blob(), dispose() {} }),
  terminateFFmpeg: vi.fn(),
  getEngineMode: vi.fn(() => "multi"),
}));
vi.mock("@/lib/sessionDB", () => ({
  saveSessionFile: vi.fn().mockResolvedValue(undefined),
  loadSessionFile: vi.fn().mockResolvedValue(null),
  clearSessionFile: vi.fn().mockResolvedValue(undefined),
}));

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "src", {
    configurable: true,
    get: () => "",
    set(this: HTMLVideoElement) {
      setTimeout(() => this.onloadedmetadata?.(new Event("loadedmetadata")), 0);
    },
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1920 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 1080 });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 30 });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

const mp4 = () =>
  new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])], "clip.mp4", { type: "video/mp4" });

async function editor() {
  const hook = renderHook(() => useVideoEditor());
  act(() => hook.result.current.handleFileSelect(mp4()));
  await waitFor(() => expect(hook.result.current.file).not.toBeNull());
  return hook;
}

const square = BUILT_IN_PROFILES.find((p) => p.name === "Square 1080")!;
const portrait = BUILT_IN_PROFILES.find((p) => p.name === "Portrait 9 : 16")!;

describe("applying profiles in the editor", () => {
  it("is one undo step that keeps trims and other edits, and exports what it shows", async () => {
    const { result } = await editor();
    act(() => result.current.updateRecipe({ trimStart: 3, trimEnd: 9, rotate: 90, brightness: 0.4 }));
    act(() => result.current.setOverlayPosition("top-left"));
    const before = result.current.recipe;

    act(() => result.current.applyExportProfile(square.settings));
    expect(result.current.recipe).toMatchObject({ preset: "square-1-1", framing: "fit", format: "mp4", quality: 23 });
    expect(result.current.recipe).toMatchObject({ trimStart: 3, trimEnd: 9, rotate: 90, brightness: 0.4 });
    expect(result.current.overlayPosition).toBe("top-left");

    act(() => result.current.updateRecipe({ framing: "fill" }));
    await act(() => result.current.handleExport());
    expect(vi.mocked(exportVideo).mock.calls.at(-1)![1]).toMatchObject({ preset: "square-1-1", framing: "fill", trimStart: 3 });

    act(() => result.current.undo()); // framing
    act(() => result.current.undo()); // the profile, in one step
    expect(result.current.recipe).toEqual(before);
    act(() => result.current.redo());
    expect(result.current.recipe.preset).toBe("square-1-1");
  });

  it("records nothing when the profile is already applied", async () => {
    const { result } = await editor();
    act(() => result.current.applyExportProfile(portrait.settings));
    act(() => result.current.applyExportProfile(portrait.settings));
    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
  });

  it("turns audio off for a GIF profile and undo turns it back on", async () => {
    const { result } = await editor();
    act(() => result.current.applyExportProfile({ ...square.settings, format: "gif" }));
    expect(result.current.recipe.keepAudio).toBe(false);
    act(() => result.current.undo());
    expect(result.current.recipe.keepAudio).toBe(DEFAULT_RECIPE.keepAudio);
  });
});

describe("saved profiles", () => {
  const settings = { ...square.settings, format: "webm" as const, framing: "fill" as const };

  it("persist across reloads and never include built-ins or edits", async () => {
    const first = renderHook(() => useExportProfiles());
    act(() => {
      first.result.current.save("Square WebM", settings);
    });
    const stored = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)!);
    expect(stored.profiles).toHaveLength(1);
    expect(Object.keys(stored.profiles[0].settings).sort()).toEqual(["customHeight", "customWidth", "format", "framing", "preset", "quality"]);

    const second = renderHook(() => useExportProfiles());
    await waitFor(() => expect(second.result.current.profiles.map((p) => p.name)).toEqual(["Square WebM"]));
  });

  it("refuses to overwrite profiles from a newer Reframe", async () => {
    const newer = JSON.stringify({ schemaVersion: 99, profiles: [] });
    localStorage.setItem(PROFILE_STORAGE_KEY, newer);
    const { result } = renderHook(() => useExportProfiles());
    await waitFor(() => expect(result.current.status.readOnly).toBe(true));
    let change!: ReturnType<typeof result.current.save>;
    act(() => {
      change = result.current.save("X", settings);
    });
    expect(change.ok).toBe(false);
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBe(newer);
  });

  it("keeps working for the session when storage is full", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const { result } = renderHook(() => useExportProfiles());
    act(() => {
      result.current.save("Temp", settings);
    });
    expect(result.current.profiles).toHaveLength(1);
    expect(result.current.status.message).toMatch(/Couldn't save profiles/);
    setItem.mockRestore();
  });
});

describe("ExportProfiles UI", () => {
  function setup() {
    const onApply = vi.fn();
    const Harness = () => {
      const store = useExportProfiles();
      return (
        <ExportProfiles
          recipe={{ ...DEFAULT_RECIPE, ...square.settings }}
          userProfiles={store.profiles}
          status={store.status}
          onApply={onApply}
          onSave={store.save}
          onRename={store.rename}
          onDelete={store.remove}
        />
      );
    };
    render(<Harness />);
    return { onApply };
  }

  it("marks the active profile, applies on click, and manages user profiles", () => {
    const { onApply } = setup();
    expect(screen.getByRole("button", { name: "Square 1080, 1080 × 1080, MP4, Fit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Landscape 1080p/ })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: /Portrait 9 : 16/ }));
    expect(onApply).toHaveBeenCalledWith(portrait.settings);

    fireEvent.change(screen.getByLabelText(/Save the current output settings/), { target: { value: "My square" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByRole("button", { name: /^My square, 1080 × 1080, MP4/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rename My square" }));
    fireEvent.change(screen.getByLabelText("New name for My square"), { target: { value: "Square for clips" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: /^Square for clips, / })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Square for clips" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("button", { name: /^Square for clips, / })).not.toBeInTheDocument();
    // Built-ins have no rename or delete controls.
    expect(screen.queryByRole("button", { name: /Rename Square 1080/ })).not.toBeInTheDocument();
  });

  it("explains why a name was rejected", () => {
    setup();
    fireEvent.change(screen.getByLabelText(/Save the current output settings/), { target: { value: "square 1080" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
  });
});
