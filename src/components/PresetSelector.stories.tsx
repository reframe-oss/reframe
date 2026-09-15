import type { Meta, StoryObj } from "@storybook/nextjs";
import PresetSelector from "./PresetSelector";
import { RecipeHarness, makeRecipe } from "./__stories__/RecipeHarness";

/**
 * The preset grid is the first real choice a user makes, and the most
 * layout-sensitive part of the editor: presets are grouped into categories and
 * each tile draws a scaled aspect-ratio box, so a change to spacing or to the
 * ratio maths surfaces here before anywhere else.
 */
const meta = {
  title: "Editor/Controls/PresetSelector",
  component: PresetSelector,
  parameters: { layout: "padded" },
  args: {
    recipe: makeRecipe(),
    onChange: () => {},
  },
  // `recipe` seeds the harness, which then owns the state so the control is
  // actually interactive in Storybook rather than frozen on first render.
  render: (args) => (
    <RecipeHarness initial={args.recipe}>
      {(recipe, onChange) => <PresetSelector recipe={recipe} onChange={onChange} />}
    </RecipeHarness>
  ),
} satisfies Meta<typeof PresetSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default state — the 9:16 vertical preset selected. */
export const Default: Story = {};

/** A landscape preset selected, to catch category/highlight regressions. */
export const LandscapeSelected: Story = {
  args: { recipe: makeRecipe({ preset: "landscape-16-9" }) },
};

/**
 * Custom dimensions reveal the width/height inputs, historically the source of
 * overflow bugs in this panel.
 */
export const CustomDimensions: Story = {
  args: {
    recipe: makeRecipe({
      preset: "custom",
      customWidth: 1440,
      customHeight: 1080,
    }),
  },
};
