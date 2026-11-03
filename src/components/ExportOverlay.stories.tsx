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
 * The engine-loading state uses a CSS indeterminate bar; Chromatic pauses CSS
 * animations, so it needs no special handling.
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
    // The TipCarousel root (a data attribute, so restyling can't break it).
    const marked: Element[] = [];

    document.querySelectorAll("[data-tip-carousel]").forEach((el) => {
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
    summary: { format: "MP4", resolution: "1080 × 1920", quality: "Balanced (CRF 23)" },
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

/** High-contrast palette: yellow progress and black/white surfaces. */
export const HighContrast: Story = {
  args: { status: "exporting", progress: 62 },
  decorators: [
    (Story) => (
      <HighContrastFrame>
        <Story />
      </HighContrastFrame>
    ),
  ],
};

function HighContrastFrame({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    document.documentElement.dataset.theme = "high-contrast";
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, []);
  return <>{children}</>;
}
