/** Keyboard handling for undo/redo, kept separate so it can be unit tested. */

// Inputs where the browser's own undo applies to the typed text.
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/**
 * True when focus is somewhere the user is typing. Undo shortcuts are left to
 * the browser there, so Cmd/Ctrl+Z edits the text rather than the video.
 * Sliders, checkboxes and buttons are not text entry: undo applies to the edit.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    return TEXT_INPUT_TYPES.has(((el as HTMLInputElement).type || "text").toLowerCase());
  }
  return false;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

type ShortcutEvent = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

/**
 * macOS: ⌘Z undo, ⇧⌘Z redo. Elsewhere: Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo.
 */
export function matchHistoryShortcut(e: ShortcutEvent, isMac: boolean): "undo" | "redo" | null {
  if (e.altKey) return null;
  const primary = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!primary) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && !isMac && !e.shiftKey) return "redo";
  return null;
}
