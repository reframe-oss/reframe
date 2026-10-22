import { describe, it, expect } from "vitest";
import {
  COALESCE_WINDOW_MS,
  HISTORY_LIMIT,
  coalesceKey,
  createHistory,
  deepEqual,
  historyReducer,
  recordEdit,
  redo,
  undo,
  type EditHistory,
  type EditState,
} from "@/lib/editHistory";
import { toEditState } from "@/lib/project";
import { DEFAULT_RECIPE } from "@/lib/constants";
import { createDefaultTextOverlay } from "@/lib/text-overlay";

const base = toEditState(DEFAULT_RECIPE);

function withRecipe(edit: EditState, patch: Partial<EditState["recipe"]>): EditState {
  return { ...edit, recipe: { ...edit.recipe, ...patch } };
}

/** Applies a series of patches, each `gap` ms after the previous one. */
function play(
  history: EditHistory,
  patches: Array<Partial<EditState["recipe"]>>,
  gap: number,
  start = 1_000
): EditHistory {
  return patches.reduce(
    (h, patch, i) => recordEdit(h, withRecipe(h.present, patch), start + i * gap),
    history
  );
}

describe("edit history", () => {
  it("records mixed edits and undoes them in reverse order", () => {
    let h = createHistory(base);
    h = play(h, [{ rotate: 90 }, { preset: "square-1-1" }, { trimStart: 2 }, { format: "webm" }], 2_000);
    expect(h.past).toHaveLength(4);

    h = undo(h);
    expect(h.present.recipe.format).toBe("mp4");
    expect(h.present.recipe.trimStart).toBe(2);
    h = undo(h);
    expect(h.present.recipe.trimStart).toBe(0);
    h = undo(h);
    expect(h.present.recipe.preset).toBe(DEFAULT_RECIPE.preset);
    h = undo(h);
    expect(h.present).toEqual(base);
  });

  it("survives repeated undo/redo cycles without drifting", () => {
    let h = play(createHistory(base), [{ rotate: 90 }, { brightness: 0.5 }, { speed: 2 }], 2_000);
    const end = h.present;
    for (let i = 0; i < 5; i++) {
      h = undo(undo(undo(h)));
      expect(h.present).toEqual(base);
      h = redo(redo(redo(h)));
      expect(h.present).toEqual(end);
    }
    expect(h.past).toHaveLength(3);
    expect(h.future).toHaveLength(0);
  });

  it("does nothing at either end of the history", () => {
    const h = createHistory(base);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);

    const one = play(h, [{ rotate: 180 }], 2_000);
    expect(redo(one)).toBe(one);
    const back = undo(one);
    expect(undo(back)).toBe(back);
  });

  it("drops the redo stack when a new edit is made after undo", () => {
    let h = play(createHistory(base), [{ rotate: 90 }, { rotate: 180 }], 2_000);
    h = undo(h);
    h = recordEdit(h, withRecipe(h.present, { framing: "fill" }), 10_000);
    expect(h.future).toHaveLength(0);
    expect(redo(h)).toBe(h);
  });

  it("never records a change that leaves the state as it was", () => {
    const h = createHistory(base);
    expect(recordEdit(h, withRecipe(base, {}), 1_000)).toBe(h);
    expect(recordEdit(h, toEditState({ ...DEFAULT_RECIPE }), 1_000)).toBe(h);
  });

  it("collapses a continuous slider drag into one undo step", () => {
    const drag = Array.from({ length: 200 }, (_, i) => ({ brightness: Math.round(i / 2) / 100 }));
    const h = play(createHistory(base), drag, 16);
    expect(h.past).toHaveLength(1);
    expect(h.present.recipe.brightness).toBe(drag[drag.length - 1]!.brightness);
    expect(undo(h).present.recipe.brightness).toBe(0);
  });

  it("starts a new step after the slider rests past the coalescing window", () => {
    let h = play(createHistory(base), [{ volume: 90 }, { volume: 80 }], 16);
    h = play(h, [{ volume: 70 }, { volume: 60 }], 16, 1_000 + COALESCE_WINDOW_MS + 500);
    expect(h.past).toHaveLength(2);
    expect(undo(h).present.recipe.volume).toBe(80);
  });

  it("starts a new step when a different control is moved", () => {
    const h = play(createHistory(base), [{ brightness: 0.2 }, { contrast: 1.5 }, { brightness: 0.3 }], 16);
    expect(h.past).toHaveLength(3);
  });

  it("removes the step entirely when a drag ends where it started", () => {
    const h = play(createHistory(base), [{ saturation: 1.5 }, { saturation: 2 }, { saturation: 1 }], 16);
    expect(h.past).toHaveLength(0);
    expect(h.present).toEqual(base);
  });

  it("keeps rapid clicks on discrete controls as separate steps", () => {
    const h = play(createHistory(base), [{ rotate: 90 }, { rotate: 180 }, { rotate: 270 }], 50);
    expect(h.past).toHaveLength(3);
  });

  it("merges typing and dragging on one text overlay, but not adding overlays", () => {
    const overlay = createDefaultTextOverlay();
    let h = recordEdit(createHistory(base), withRecipe(base, { textOverlays: [overlay] }), 1_000);
    const second = createDefaultTextOverlay();
    h = recordEdit(h, withRecipe(h.present, { textOverlays: [overlay, second] }), 1_010);
    expect(h.past).toHaveLength(2);

    for (const [i, text] of ["H", "He", "Hel", "Hell", "Hello"].entries()) {
      h = recordEdit(
        h,
        withRecipe(h.present, { textOverlays: [{ ...overlay, text }, second] }),
        2_000 + i * 100
      );
    }
    expect(h.past).toHaveLength(3);

    const moved = h.present.recipe.textOverlays;
    for (let i = 1; i <= 30; i++) {
      h = recordEdit(
        h,
        withRecipe(h.present, { textOverlays: [moved[0]!, { ...second, x: 50 - i }] }),
        5_000 + i * 16
      );
    }
    expect(h.past).toHaveLength(4);
    expect(undo(h).present.recipe.textOverlays[1]!.x).toBe(second.x);
  });

  it("is bounded and keeps the most recent steps", () => {
    const edits = Array.from({ length: HISTORY_LIMIT + 25 }, (_, i) => ({
      rotate: ([0, 90, 180, 270] as const)[(i + 1) % 4],
      customWidth: 100 + i,
    }));
    let h = play(createHistory(base), edits, 2_000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);

    let steps = 0;
    while (h.past.length) {
      h = undo(h);
      steps++;
    }
    expect(steps).toBe(HISTORY_LIMIT);
    // The oldest reachable state is the one just before the last 100 edits.
    expect(h.present.recipe.customWidth).toBe(100 + 24);
  });

  it("includes image overlay settings in the snapshot", () => {
    const moved: EditState = { ...base, imageOverlay: { ...base.imageOverlay, position: "top-left" } };
    const h = recordEdit(createHistory(base), moved, 1_000);
    expect(undo(h).present.imageOverlay.position).toBe("bottom-right");
    expect(coalesceKey(base, moved)).toBeNull();
  });

  it("reducer reset starts a clean history from the derived state", () => {
    let h = play(createHistory(base), [{ rotate: 90 }, { rotate: 180 }], 2_000);
    h = historyReducer(h, { type: "reset", update: (prev) => withRecipe(prev, { trimStart: 0 }) });
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
    expect(h.present.recipe.rotate).toBe(180);
  });
});

describe("deepEqual", () => {
  it("compares nested plain data and treats missing and undefined keys alike", () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });
});
