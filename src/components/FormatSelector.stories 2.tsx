import type { Meta, StoryObj } from "@storybook/nextjs";
import FormatSelector from "./FormatSelector";
import { RecipeHarness, makeRecipe } from "./__stories__/RecipeHarness";

/** Container format choice: mp4 / webm / mkv / gif. */
const meta = {
  title: "Editor/Controls/FormatSelector",
  component: FormatSelector,
  parameters: { layout: "padded" },
  args: {
    recipe: makeRecipe(),
    onChange: () => {},
  },
  // `recipe` seeds the harness, which then owns the state so the control is
  // actually interactive in Storybook rather than frozen on first render.
  render: (args) => (
    <RecipeHarness initial={args.recipe}>
      {(recipe, onChange) => <FormatSelector recipe={recipe} onChange={onChange} />}
    </RecipeHarness>
  ),
} satisfies Meta<typeof FormatSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WebM: Story = { args: { recipe: makeRecipe({ format: "webm" }) } };

/** GIF is the odd one out — it drops audio, so its selected state matters. */
export const Gif: Story = { args: { recipe: makeRecipe({ format: "gif" }) } };
