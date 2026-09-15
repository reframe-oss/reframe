import * as React from "react";
import type { Meta, StoryObj, Decorator } from "@storybook/nextjs";
import ExportOverlay from "./ExportOverlay";

/**
 * Full-screen modal shown while an export runs.
 *
 * ── Why this file works the way it does ──────────────────────────────────────
 * The overlay contains a <TipCarousel/> that rotates to the next tip every
 * 6000ms. A visual regression service screenshots at an arbitrary moment, so
 * that rotation reports a change on every build that reflects nothing but
 * timing. It is marked data-chromatic="ignore": Chromatic still renders it,
 * but excludes it from the diff.
 *
 * The Lottie spinner used to need the same treatment. It no longer does —
 * LottiePlayer checks isChromatic() and renders frame 0 statically, so the
 * spinner is deterministic and stays fully covered by the diff.
 *
 * A word of warning from how this file got here: an earlier version froze both
 * by stubbing window.setInterval and window.requestAnimationFrame. Chromatic's
 * capture instrumentation relies on requestAnimationFrame to decide a story
 * has settled, so starving it meant all six snapshots (3 stories x light/dark)
 * failed with "took too long to load". Never stub browser globals to stabilise
 * a snapshot.
 */
const withCarouselIgnored: Decorator = (Story) => (
  <IgnoreCarousel>
    <Story />
  </IgnoreCarousel>
);

function IgnoreCarousel({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    // The TipCarousel root, identified by its min-h-[142px] utility.
    const marked: Element[] = [];

    document.querySelectorAll('[class*="min-h-[142px]"]').forEach((el) => {
      el.setAttribute("data-chromatic", "ignore");
      marked.push(el);
    });

    return () => marked.forEach((el) => el.removeAttribute("data-chromatic"));
  }, []);

  return <>{children}</>;
}

const meta = {
  title: "Editor/Modals/ExportOverlay",
  component: ExportOverlay,
  parameters: { layout: "fullscreen" },
  decorators: [withCarouselIgnored],
  args: {
    // With a real timestamp the component starts a 1s interval and renders
    // Date.now() - exportStartedAt as elapsed time, which would differ between
    // builds. null takes its own early-return branch and pins it at zero.
    exportStartedAt: null,
    onCancel: () => {},
  },
} satisfies Meta<typeof ExportOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * FFmpeg.wasm (~30 MB) is being fetched on first export.
 *
 * The overlay only renders for "loading-engine" and "exporting"; the other
 * ExportStatus values return null, so they aren't worth stories.
 */
export const LoadingEngine: Story = {
  args: { status: "loading-engine", progress: 0 },
};

/** Mid-export, just past a third done. */
export const Exporting: Story = {
  args: { status: "exporting", progress: 37 },
};

/** Near completion — checks the progress bar at the far end of its track. */
export const AlmostDone: Story = {
  args: { status: "exporting", progress: 98 },
};
