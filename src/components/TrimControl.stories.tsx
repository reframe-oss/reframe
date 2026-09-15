import type { Meta, StoryObj } from "@storybook/nextjs";
import TrimControl from "./TrimControl";
import { RecipeHarness, makeRecipe } from "./__stories__/RecipeHarness";

/**
 * Trim in/out controls.
 *
 * Determinism note: `file` is null in every story. The component feeds it to
 * useAudioWaveform, which decodes real audio to draw the waveform — an async
 * result that depends on the media, so a real file would make these snapshots
 * unstable. The null path still renders the trim inputs and duration readout,
 * which is the part worth regression-testing.
 */
const meta = {
  title: "Editor/Controls/TrimControl",
  component: TrimControl,
  parameters: { layout: "padded" },
  args: {
    recipe: makeRecipe(),
    onChange: () => {},
    duration: 90,
    file: null,
  },
  render: (args) => (
    <RecipeHarness initial={args.recipe}>
      {(recipe, onChange) => (
        <TrimControl
          recipe={recipe}
          onChange={onChange}
          duration={args.duration}
          file={args.file}
        />
      )}
    </RecipeHarness>
  ),
} satisfies Meta<typeof TrimControl>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full 90-second clip, nothing trimmed. */
export const Default: Story = {};

/** A trimmed range, so the computed output duration is exercised. */
export const Trimmed: Story = {
  args: { recipe: makeRecipe({ trimStart: 12.5, trimEnd: 47.25 }) },
};

/** Before media loads the duration is 0 — check it degrades cleanly. */
export const NoMediaLoaded: Story = {
  args: { duration: 0 },
};
