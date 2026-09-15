import type { Meta, StoryObj } from "@storybook/nextjs";
import FramingControl from "./FramingControl";
import { RecipeHarness, makeRecipe } from "./__stories__/RecipeHarness";

/** Fit (letterbox) vs Fill (crop) toggle. */
const meta = {
  title: "Editor/Controls/FramingControl",
  component: FramingControl,
  parameters: { layout: "padded" },
  args: {
    recipe: makeRecipe(),
    onChange: () => {},
  },
  // `recipe` seeds the harness, which then owns the state so the control is
  // actually interactive in Storybook rather than frozen on first render.
  render: (args) => (
    <RecipeHarness initial={args.recipe}>
      {(recipe, onChange) => <FramingControl recipe={recipe} onChange={onChange} />}
    </RecipeHarness>
  ),
} satisfies Meta<typeof FramingControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fit: Story = { args: { recipe: makeRecipe({ framing: "fit" }) } };

export const Fill: Story = { args: { recipe: makeRecipe({ framing: "fill" }) } };
