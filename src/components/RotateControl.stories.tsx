import type { Meta, StoryObj } from "@storybook/nextjs";
import RotateControl from "./RotateControl";
import { RecipeHarness, makeRecipe } from "./__stories__/RecipeHarness";

/**
 * Rotation buttons (0/90/180/270), implemented as a radiogroup with roving
 * tabindex — so the selected-state styling is worth pinning down visually.
 */
const meta = {
  title: "Editor/Controls/RotateControl",
  component: RotateControl,
  parameters: { layout: "padded" },
  args: {
    recipe: makeRecipe(),
    onChange: () => {},
  },
  // `recipe` seeds the harness, which then owns the state so the control is
  // actually interactive in Storybook rather than frozen on first render.
  render: (args) => (
    <RecipeHarness initial={args.recipe}>
      {(recipe, onChange) => <RotateControl recipe={recipe} onChange={onChange} />}
    </RecipeHarness>
  ),
} satisfies Meta<typeof RotateControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoRotation: Story = { args: { recipe: makeRecipe({ rotate: 0 }) } };

export const Rotated90: Story = { args: { recipe: makeRecipe({ rotate: 90 }) } };

export const Rotated270: Story = {
  args: { recipe: makeRecipe({ rotate: 270 }) },
};
