import { renderHook, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";
import { isTextEntryTarget, matchHistoryShortcut } from "@/lib/historyShortcuts";
import { DEFAULT_RECIPE } from "@/lib/constants";

function setPlatform(platform: "MacIntel" | "Win32") {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

function setup(file: File | null = new File(["x"], "a.mp4")) {
  const undo = vi.fn();
  const redo = vi.fn();
  const resetSettings = vi.fn();
  renderHook(() =>
    useKeyboardShortcuts({
      file,
      recipe: DEFAULT_RECIPE,
      resetSettings,
      updateRecipe: vi.fn(),
      handleExport: vi.fn(),
      status: "idle",
      cancelExport: vi.fn(),
      onToggleShortcutsModal: vi.fn(),
      currentTime: 0,
      duration: 10,
      undo,
      redo,
    })
  );
  return { undo, redo, resetSettings };
}

function element(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("matchHistoryShortcut", () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods }) as KeyboardEvent;

  it("uses Command on macOS", () => {
    expect(matchHistoryShortcut(key("z", { metaKey: true }), true)).toBe("undo");
    expect(matchHistoryShortcut(key("Z", { metaKey: true, shiftKey: true }), true)).toBe("redo");
    expect(matchHistoryShortcut(key("z", { ctrlKey: true }), true)).toBeNull();
    expect(matchHistoryShortcut(key("y", { metaKey: true }), true)).toBeNull();
  });

  it("uses Ctrl elsewhere, with both Ctrl+Y and Ctrl+Shift+Z for redo", () => {
    expect(matchHistoryShortcut(key("z", { ctrlKey: true }), false)).toBe("undo");
    expect(matchHistoryShortcut(key("y", { ctrlKey: true }), false)).toBe("redo");
    expect(matchHistoryShortcut(key("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(matchHistoryShortcut(key("z", { metaKey: true }), false)).toBeNull();
  });

  it("ignores Alt combinations and plain keys", () => {
    expect(matchHistoryShortcut(key("z", { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(matchHistoryShortcut(key("z"), false)).toBeNull();
  });
});

describe("isTextEntryTarget", () => {
  it.each([
    ['<input type="text">', true],
    ['<input type="number">', true],
    ["<input>", true],
    ["<textarea></textarea>", true],
    ['<input type="range">', false],
    ['<input type="checkbox">', false],
    ["<button>b</button>", false],
    ["<select><option>a</option></select>", false],
  ])("%s → %s", (html, expected) => {
    expect(isTextEntryTarget(element(html))).toBe(expected);
  });

  it("treats contenteditable as text entry", () => {
    const el = element('<div contenteditable="true">x</div>');
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(isTextEntryTarget(el)).toBe(true);
  });
});

describe("undo/redo shortcuts", () => {
  it("undoes and redoes with Ctrl on Windows/Linux", () => {
    setPlatform("Win32");
    const { undo, redo } = setup();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("undoes with Command on macOS and prevents the browser default", () => {
    setPlatform("MacIntel");
    const { undo } = setup();
    const event = new KeyboardEvent("keydown", { key: "z", metaKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("works while a slider has focus", () => {
    setPlatform("Win32");
    const { undo } = setup();
    const slider = element('<input type="range">');
    fireEvent.keyDown(slider, { key: "z", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("leaves text undo to the browser inside text fields", () => {
    setPlatform("Win32");
    const { undo } = setup();
    const input = element('<input type="text">');
    const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true, bubbles: true });
    input.dispatchEvent(event);
    expect(undo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing before a video is loaded", () => {
    setPlatform("Win32");
    const { undo } = setup(null);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });
});
