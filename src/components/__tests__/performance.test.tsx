import React, { Profiler, createRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

// ── ThumbnailStrip: frame generation is mocked; we test React-side behaviour ──
const generateMock = vi.fn();
vi.mock("@/lib/thumbnails", async (orig) => {
  const actual = await orig<typeof import("@/lib/thumbnails")>();
  return { ...actual, generateThumbnails: (...args: unknown[]) => generateMock(...args) };
});

import ThumbnailStrip, { findActiveFrameIndex } from "../ThumbnailStrip";
import VideoPreview from "../VideoPreview";
import FileUpload from "../FileUpload";
import { ThemeProvider } from "../ThemeProvider";
import { ThemeToggle, ContrastToggle } from "../ThemeToggle";
import { DEFAULT_RECIPE } from "@/lib/constants";

const frames = [0, 2, 4, 6].map((time) => ({ time, url: `blob:f${time}` }));

beforeEach(() => {
  generateMock.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

describe("findActiveFrameIndex", () => {
  it("finds the last frame at or before the playhead", () => {
    expect(findActiveFrameIndex(frames, -1)).toBe(-1);
    expect(findActiveFrameIndex(frames, 0)).toBe(0);
    expect(findActiveFrameIndex(frames, 3.9)).toBe(1);
    expect(findActiveFrameIndex(frames, 100)).toBe(3);
  });
});

describe("ThumbnailStrip", () => {
  it("re-renders on playback only when the active frame changes", async () => {
    generateMock.mockResolvedValue({ frames, skipped: 0 });
    const video = document.createElement("video");
    const videoRef = { current: video };
    let commits = 0;
    render(
      <Profiler id="strip" onRender={() => commits++}>
        <ThumbnailStrip videoSrc="blob:src" duration={8} videoRef={videoRef} onSeek={() => {}} />
      </Profiler>
    );
    await screen.findByText(/4 frames/);
    const before = commits;

    // 20 timeupdates inside the first frame's range: no commits at all.
    for (let i = 0; i < 20; i++) {
      Object.defineProperty(video, "currentTime", { configurable: true, value: 0.05 * i });
      act(() => {
        video.dispatchEvent(new Event("timeupdate"));
      });
    }
    expect(commits).toBe(before);

    // Crossing into the next frame: exactly one commit, and the right frame is current.
    Object.defineProperty(video, "currentTime", { configurable: true, value: 2.1 });
    act(() => {
      video.dispatchEvent(new Event("timeupdate"));
    });
    expect(commits).toBe(before + 1);
    expect(screen.getByRole("button", { name: "Seek to 0:02" })).toHaveAttribute("aria-current", "true");
  });

  it("aborts in-flight generation and revokes frames when the source changes", async () => {
    generateMock.mockResolvedValueOnce({ frames, skipped: 0 });
    const { rerender, unmount } = render(
      <ThumbnailStrip videoSrc="blob:a" duration={8} onSeek={() => {}} />
    );
    await screen.findByText(/4 frames/);

    let signal: AbortSignal | undefined;
    generateMock.mockImplementationOnce((_src, _times, opts: { signal: AbortSignal }) => {
      signal = opts.signal;
      return new Promise(() => {});
    });
    rerender(<ThumbnailStrip videoSrc="blob:b" duration={8} onSeek={() => {}} />);
    // Frames from the previous source were released.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:f0");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:f6");

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("shows a recoverable message when generation fails", async () => {
    generateMock.mockRejectedValueOnce(new Error("Video could not be decoded for thumbnails"));
    render(<ThumbnailStrip videoSrc="blob:a" duration={8} onSeek={() => {}} />);
    expect(await screen.findByText(/couldn.t be generated/i)).toBeInTheDocument();
    generateMock.mockResolvedValueOnce({ frames, skipped: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/4 frames/)).toBeInTheDocument();
  });

  it("caps work for long videos", async () => {
    generateMock.mockResolvedValue({ frames: [], skipped: 0 });
    render(<ThumbnailStrip videoSrc="blob:a" duration={4 * 3600} onSeek={() => {}} />);
    await waitFor(() => expect(generateMock).toHaveBeenCalled());
    const times = generateMock.mock.calls[0]![1] as number[];
    expect(times.length).toBeLessThanOrEqual(48);
  });
});

// ── VideoPreview: ResizeObserver guard ─────────────────────────────────────
describe("VideoPreview sizing", () => {
  let observerCallback: ResizeObserverCallback | null = null;
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: ResizeObserverCallback) {
          observerCallback = cb;
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("skips re-rendering when the measured size hasn't changed", () => {
    let commits = 0;
    const file = new File(["x"], "a.mp4", { type: "video/mp4" });
    render(
      <Profiler id="preview" onRender={() => commits++}>
        <VideoPreview file={file} recipe={{ ...DEFAULT_RECIPE }} videoRef={createRef<HTMLVideoElement>()} />
      </Profiler>
    );
    const fire = (width: number, height: number) =>
      act(() => observerCallback?.([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver));

    fire(640, 360);
    const afterFirst = commits;
    fire(640, 360);
    fire(640.4, 360.2); // sub-pixel jitter
    expect(commits).toBe(afterFirst);
    fire(800, 450);
    expect(commits).toBe(afterFirst + 1);
  });
});

// ── FileUpload: one drop → one selection ───────────────────────────────────
describe("FileUpload", () => {
  it("handles a drop on the drop zone exactly once", () => {
    const onFileSelect = vi.fn();
    render(<FileUpload onFileSelect={onFileSelect} currentFile={null} fileError="" duration={0} />);
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    fireEvent.drop(screen.getByRole("button", { name: /choose a video/i }), { dataTransfer: { files: [file] } });
    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it("describes only the formats the validator accepts", () => {
    render(<FileUpload onFileSelect={() => {}} currentFile={null} fileError="" duration={0} />);
    expect(screen.queryByText(/most video formats/i)).toBeNull();
    expect(screen.getAllByText(/MP4, MOV, WebM, MKV and AVI/).length).toBeGreaterThan(0);
  });
});

// ── Themes and reduced motion ──────────────────────────────────────────────
function mockMatchMedia(matches: (q: string) => boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe("theme switching", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    delete document.documentElement.dataset.theme;
  });

  it("crossfades colours only briefly around an explicit toggle", async () => {
    vi.useFakeTimers();
    mockMatchMedia(() => false);
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    act(() => screen.getByRole("button", { name: /switch to dark/i }).click());
    expect(document.documentElement.classList.contains("theme-transition")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(document.documentElement.classList.contains("theme-transition")).toBe(false);
    vi.useRealTimers();
  });

  it("skips the crossfade entirely under prefers-reduced-motion", () => {
    mockMatchMedia((q) => q.includes("reduced-motion"));
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    act(() => screen.getByRole("button", { name: /switch to dark/i }).click());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-transition")).toBe(false);
  });

  it("high contrast is reachable, persisted, and follows prefers-contrast by default", () => {
    mockMatchMedia((q) => q.includes("prefers-contrast: more"));
    render(
      <ThemeProvider>
        <ContrastToggle />
      </ThemeProvider>
    );
    expect(document.documentElement.dataset.theme).toBe("high-contrast");
    const btn = screen.getByRole("button", { name: "High contrast" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    act(() => btn.click());
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("contrast")).toBe("standard");
  });
});

describe("global stylesheet", () => {
  const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("has no always-on universal transition", () => {
    // A `*` rule may only set transitions inside the reduced-motion override
    // or the short-lived .theme-transition window.
    const universalRules = withoutComments.match(/(^|\})\s*\*,[^{]*\{[^}]*transition[^}]*\}/g) ?? [];
    expect(universalRules).toEqual([]);
    expect(withoutComments).not.toMatch(/transition:\s*all/);
  });

  it("defines a reduced-motion override and makes no external font requests", () => {
    expect(withoutComments).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(withoutComments).not.toMatch(/@import url\(/);
  });

  it("keeps the public token names", () => {
    for (const token of ["--bg", "--surface", "--border", "--text", "--muted"]) {
      expect(withoutComments).toContain(`${token}:`);
    }
  });
});
