import type { Meta, StoryObj } from "@storybook/nextjs";
import AudioSpeedControl from "./AudioSpeedControl";
import { RecipeHarness, makeRecipe } from "./__stories__/RecipeHarness";

/** Audio toggle, volume, normalisation and playback-speed steps. */
const meta = {
  title: "Editor/Controls/AudioSpeedControl",
  component: AudioSpeedControl,
  parameters: { layout: "padded" },
  args: {
    recipe: makeRecipe(),
    onChange: () => {},
  },
  // `recipe` seeds the harness, which then owns the state so the control is
  // actually interactive in Storybook rather than frozen on first render.
  render: (args) => (
    <RecipeHarness initial={args.recipe}>
      {(recipe, onChange) => <AudioSpeedControl recipe={recipe} onChange={onChange} />}
    </RecipeHarness>
  ),
} satisfies Meta<typeof AudioSpeedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Audio stripped — the dependent volume controls should read as disabled. */
export const AudioMuted: Story = {
  args: { recipe: makeRecipe({ keepAudio: false }) },
};

/** Non-default speed and boosted volume, with normalisation on. */
export const FastWithNormalisedAudio: Story = {
  args: {
    recipe: makeRecipe({ speed: 2, volume: 150, normalizeAudio: true }),
  },
};
