/**
 * Bounded undo/redo history over immutable edit snapshots.
 *
 * Each entry is a complete `EditState` (a small JSON-like object — never the
 * video itself), so undo is a pointer swap rather than a reverse command. A
 * snapshot that equals the current one is never recorded, and rapid changes to
 * the same continuous control (a slider drag, typing into a text overlay) are
 * merged into a single entry so one gesture is one undo step.
 */
import type { EditRecipe, OverlayPosition, TextOverlay } from "./types";

export interface ImageOverlaySettings {
  position: OverlayPosition;
  size: number;
  opacity: number;
}

/**
 * Everything that changes the exported video and can be serialised. The
 * completion-sound preference lives on `EditRecipe` but is a setting, not an
 * edit, so it is excluded. So are the image/music files themselves.
 */
export interface EditState {
  recipe: Omit<EditRecipe, "soundOnCompletion">;
  imageOverlay: ImageOverlaySettings;
}

export interface EditHistory {
  past: EditState[];
  present: EditState;
  future: EditState[];
  /** Coalescing key of the entry `present` was last merged into, if any. */
  lastKey: string | null;
  lastAt: number;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_WINDOW_MS = 600;

/**
 * Fields driven by sliders, drags or typing. Repeated changes to one of these
 * within the coalescing window collapse into a single undo step. Everything
 * else (presets, format, rotate, toggles) is a discrete choice and always gets
 * its own step, however quickly it is clicked.
 */
const CONTINUOUS_FIELDS = new Set([
  "trimStart",
  "trimEnd",
  "customWidth",
  "customHeight",
  "speed",
  "volume",
  "quality",
  "brightness",
  "contrast",
  "saturation",
  "sharpness",
  "textOverlays.x",
  "textOverlays.y",
  "textOverlays.text",
  "textOverlays.fontSize",
  "textOverlays.color",
]);

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arrB = b as unknown[];
    return a.length === arrB.length && a.every((v, i) => deepEqual(v, arrB[i]));
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
  for (const key of keys) {
    // `undefined` and a missing key are the same thing once serialised.
    if (!deepEqual(objA[key], objB[key])) return false;
  }
  return true;
}

function textOverlayChanges(prev: TextOverlay[], next: TextOverlay[]): string[] | null {
  // Adding, removing or reordering overlays is structural: never coalesced.
  if (prev.length !== next.length || prev.some((o, i) => o.id !== next[i]?.id)) return null;
  const changes: string[] = [];
  next.forEach((overlay, i) => {
    const before = prev[i] as unknown as Record<string, unknown>;
    const after = overlay as unknown as Record<string, unknown>;
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!deepEqual(before[key], after[key])) changes.push(`textOverlays.${key}#${overlay.id}`);
    }
  });
  return changes;
}

/**
 * Describes a change for coalescing. Returns `null` when the change must
 * always be its own history entry.
 */
export function coalesceKey(prev: EditState, next: EditState): string | null {
  const paths: string[] = [];
  const prevRecipe = prev.recipe as unknown as Record<string, unknown>;
  const nextRecipe = next.recipe as unknown as Record<string, unknown>;

  for (const key of new Set([...Object.keys(prevRecipe), ...Object.keys(nextRecipe)])) {
    if (deepEqual(prevRecipe[key], nextRecipe[key])) continue;
    if (key === "textOverlays") {
      const changes = textOverlayChanges(prev.recipe.textOverlays, next.recipe.textOverlays);
      if (!changes) return null;
      paths.push(...changes);
    } else {
      paths.push(key);
    }
  }
  for (const key of Object.keys(next.imageOverlay) as Array<keyof ImageOverlaySettings>) {
    if (prev.imageOverlay[key] !== next.imageOverlay[key]) paths.push(`imageOverlay.${key}`);
  }

  if (paths.length === 0) return null;
  const continuous = paths.every((path) => CONTINUOUS_FIELDS.has(path.split("#")[0] ?? path));
  return continuous ? paths.sort().join("|") : null;
}

export function createHistory(present: EditState): EditHistory {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function recordEdit(
  history: EditHistory,
  next: EditState,
  now: number,
  limit: number = HISTORY_LIMIT
): EditHistory {
  if (deepEqual(next, history.present)) return history;

  const key = coalesceKey(history.present, next);
  const canMerge =
    key !== null &&
    key === history.lastKey &&
    now - history.lastAt <= COALESCE_WINDOW_MS &&
    history.past.length > 0;

  if (canMerge) {
    const before = history.past[history.past.length - 1];
    // Dragged back to where the gesture started: the step is now a no-op.
    if (deepEqual(next, before)) {
      return { past: history.past.slice(0, -1), present: next, future: [], lastKey: null, lastAt: 0 };
    }
    return { ...history, present: next, future: [], lastAt: now };
  }

  const past = [...history.past, history.present];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
    lastKey: key,
    lastAt: now,
  };
}

export function undo(history: EditHistory): EditHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastKey: null,
    lastAt: 0,
  };
}

export function redo(history: EditHistory): EditHistory {
  const following = history.future[0];
  if (!following) return history;
  return {
    past: [...history.past, history.present],
    present: following,
    future: history.future.slice(1),
    lastKey: null,
    lastAt: 0,
  };
}

export type HistoryAction =
  | { type: "edit"; update: (prev: EditState) => EditState; now: number }
  /** Starts a fresh history (new source video, restored or deleted project). */
  | { type: "reset"; update: (prev: EditState) => EditState }
  | { type: "undo" }
  | { type: "redo" };

export function historyReducer(history: EditHistory, action: HistoryAction): EditHistory {
  switch (action.type) {
    case "edit":
      return recordEdit(history, action.update(history.present), action.now);
    case "reset":
      return createHistory(action.update(history.present));
    case "undo":
      return undo(history);
    case "redo":
      return redo(history);
  }
}
