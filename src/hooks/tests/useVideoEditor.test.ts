import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useVideoEditor } from "../useVideoEditor";
import { DEFAULT_RECIPE } from "@/lib/constants";

// Mock the dependencies
vi.mock("@/lib/ffmpeg", () => ({
  loadFFmpeg: vi.fn().mockResolvedValue(true),
  exportVideo: vi.fn().mockResolvedValue({ blobUrl: "blob:test" }),
  terminateFFmpeg: vi.fn(),
  FFmpegLoadError: class extends Error {},
}));

vi.mock("@/lib/sessionDB", () => ({
  saveSessionFile: vi.fn().mockResolvedValue(undefined),
  loadSessionFile: vi.fn().mockResolvedValue(null),
  clearSessionFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock browser APIs
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value.toString(); }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });
Object.defineProperty(window, "URL", {
  value: {
    createObjectURL: vi.fn().mockReturnValue("blob:test"),
    revokeObjectURL: vi.fn(),
  },
});

describe("useVideoEditor core controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it("should initialize with the default recipe", () => {
    const { result, unmount } = renderHook(() => useVideoEditor());
    expect(result.current.recipe).toEqual({
      ...DEFAULT_RECIPE,
      soundOnCompletion: false,
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.file).toBeNull();
    unmount();
  });

  it("should safely update recipe with valid patch values", () => {
    const { result, unmount } = renderHook(() => useVideoEditor());
    act(() => {
      result.current.updateRecipe({ speed: 2, quality: 20 });
    });
    expect(result.current.recipe.speed).toBe(2);
    expect(result.current.recipe.quality).toBe(20);
    unmount();
  });

  it("should ignore invalid patch values via isValidValue check", () => {
    const { result, unmount } = renderHook(() => useVideoEditor());
    act(() => {
      // 9999 is invalid for speed, -50 is invalid for quality
      result.current.updateRecipe({ speed: 9999, quality: -50 } as any);
    });
    // Values should remain as defaults
    expect(result.current.recipe.speed).toBe(DEFAULT_RECIPE.speed);
    expect(result.current.recipe.quality).toBe(DEFAULT_RECIPE.quality);
    unmount();
  });

  it("should reset settings to default when resetSettings is called", () => {
    const { result, unmount } = renderHook(() => useVideoEditor());
    act(() => {
      result.current.updateRecipe({ speed: 1.5 });
    });
    expect(result.current.recipe.speed).toBe(1.5);
    
    act(() => {
      result.current.resetSettings();
    });
    expect(result.current.recipe.speed).toBe(DEFAULT_RECIPE.speed);
    unmount();
  });

  it("should clamp trimEnd to 10s maximum when format is set to gif", () => {
    const { result, unmount } = renderHook(() => useVideoEditor());
    act(() => {
      result.current.updateRecipe({ trimStart: 0, trimEnd: 30 });
    });
    expect(result.current.recipe.trimEnd).toBe(30);

    act(() => {
      result.current.updateRecipe({ format: "gif" });
    });
    expect(result.current.recipe.format).toBe("gif");
    expect(result.current.recipe.trimEnd).toBe(10);
    expect(result.current.recipe.keepAudio).toBe(false);
    unmount();
  });

  it("should clamp trimEnd to at most trimStart + 10s when format is gif", () => {
    const { result, unmount } = renderHook(() => useVideoEditor());
    act(() => {
      result.current.updateRecipe({ format: "gif", trimStart: 5, trimEnd: 25 });
    });
    expect(result.current.recipe.format).toBe("gif");
    expect(result.current.recipe.trimStart).toBe(5);
    expect(result.current.recipe.trimEnd).toBe(15);
    unmount();
  });
});
