import type { Meta, StoryObj } from "@storybook/nextjs";
import VideoEditor from "./VideoEditor";

/**
 * The whole editor shell — the single most valuable snapshot in the project,
 * because it catches layout regressions that individual control stories miss
 * (section spacing, sidebar width, responsive stacking).
 *
 * It renders its pre-upload state here. VideoEditor owns real state via
 * useVideoEditor, but FFmpeg.wasm is lazy-loaded and only touched on export,
 * so mounting it is cheap and side-effect free.
 *
 * The onboarding tour is marked complete before the story renders. Two
 * reasons: it measures its target element and animates a spotlight over a
 * chain of timeouts, so a screenshot taken at an arbitrary moment catches it
 * mid-move and reports a change that is purely timing; and the tour's dimming
 * overlay covers most of the editor, which is precisely what this story exists
 * to show.
 *
 * Interacting further (choosing a file, exporting) needs real media and a
 * ~30 MB WASM download, so those paths are covered by the individual control
 * stories instead of here.
 */
const meta = {
  title: "Editor/VideoEditor",
  component: VideoEditor,
  parameters: {
    layout: "fullscreen",
    chromatic: { delay: 300 },
  },
  beforeEach: async () => {
    // Matches TOUR_KEY in OnboardingTour.tsx.
    window.localStorage.setItem("reframe_onboarding_complete", "1");
  },
} satisfies Meta<typeof VideoEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Initial load: upload prompt plus editor chrome. */
export const Initial: Story = {};
