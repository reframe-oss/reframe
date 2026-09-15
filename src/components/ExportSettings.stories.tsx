import type { Meta, StoryObj } from "@storybook/nextjs";
import ExportSettings from "./ExportSettings";
import { RecipeHarness, makeRecipe } from "./__stories__/RecipeHarness";

/**
 * Quality (CRF) slider plus the estimated output size, which is derived from
 * the recipe and the clip duration.
 */
const meta = {
  title: "Editor/Controls/ExportSettings",
  component: ExportSettings,
  parameters: { layout: "padded" },
  args: {
    recipe: makeRecipe(),
    onChange: () => {},
    duration: 90,
  },
  render: (args) => (
    <RecipeHarness initial={args.recipe}>
      {(recipe, onChange) => (
        <ExportSettings
          recipe={recipe}
          onChange={onChange}
          duration={args.duration}
        />
      )}
    </RecipeHarness>
  ),
} satisfies Meta<typeof ExportSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

/** CRF 23 — the default balance of size and quality. */
export const Default: Story = {};

/** Near-lossless: low CRF, large estimate. */
export const HighQuality: Story = {
  args: { recipe: makeRecipe({ quality: 16 }) },
};

/** Heavily compressed: high CRF, small estimate. */
export const SmallFile: Story = {
  args: { recipe: makeRecipe({ quality: 34 }) },
};
