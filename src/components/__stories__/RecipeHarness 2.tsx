"use client";

import * as React from "react";
import { DEFAULT_RECIPE } from "@/lib/constants";
import type { EditRecipe } from "@/lib/types";

/**
 * Shared story harness for the editor's control components.
 *
 * Every control in src/components takes the same pair of props — the whole
 * `EditRecipe` plus an `onChange(patch)` callback — and renders purely from
 * that state (the `updateRecipe(patch)` pattern described in CLAUDE.md).
 *
 * A story that passed a frozen object and a no-op `onChange` would render, but
 * clicking anything would do nothing, which makes the Storybook docs useless
 * for reviewing behaviour. This holds the recipe in real state so controls are
 * interactive, while still starting from a deterministic snapshot for
 * Chromatic.
 */
export function RecipeHarness({
  initial,
  children,
}: {
  initial?: Partial<EditRecipe>;
  children: (
    recipe: EditRecipe,
    onChange: (patch: Partial<EditRecipe>) => void
  ) => React.ReactNode;
}) {
  const [recipe, setRecipe] = React.useState<EditRecipe>({
    ...DEFAULT_RECIPE,
    ...initial,
  });

  const onChange = React.useCallback((patch: Partial<EditRecipe>) => {
    setRecipe((prev) => ({ ...prev, ...patch }));
  }, []);

  return <>{children(recipe, onChange)}</>;
}

/** A deterministic recipe for stories that only need a static value. */
export function makeRecipe(overrides: Partial<EditRecipe> = {}): EditRecipe {
  return { ...DEFAULT_RECIPE, ...overrides };
}
