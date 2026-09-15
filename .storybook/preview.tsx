import * as React from "react";
import type { Preview, Decorator } from "@storybook/nextjs";
import { withThemeByClassName } from "@storybook/addon-themes";

// The real app's stylesheet — Tailwind layers plus the :root / .dark design
// tokens (--bg, --surface, --border, --text, --muted, --accent…). Importing it
// is what makes stories look like the app rather than unstyled markup.
import "../src/app/globals.css";
import "./preview.css";

import { ThemeProvider } from "../src/components/ThemeProvider";

/**
 * Several components call useTheme(), which throws outside <ThemeProvider>.
 * Wrapping every story keeps those renderable.
 */
const withThemeProvider: Decorator = (Story) => (
  <ThemeProvider>
    <Story />
  </ThemeProvider>
);

/** Consistent padding so components aren't flush against the snapshot edge. */
const withPadding: Decorator = (Story) => (
  <div className="min-h-[80px] bg-[var(--bg)] p-6 text-[var(--text)]">
    <Story />
  </div>
);

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // The design tokens already supply the background; Storybook's own
    // background switcher would fight them.
    backgrounds: { disable: true },
    a11y: { test: "todo" },
    layout: "fullscreen",

    // Snapshot every story in both palettes. This repo's design tokens
    // (--bg, --surface, --border, --text, --muted) are redefined under `.dark`,
    // and a change that looks fine in light mode can be unreadable in dark, so
    // capturing only one theme would miss half the regressions.
    // Cost: 2 snapshots per story. Drop a mode here to halve it.
    chromatic: {
      modes: {
        light: { theme: "light" },
        dark: { theme: "dark" },
      },
    },
  },

  decorators: [
    withPadding,
    withThemeProvider,
    // Drives the `.dark` class on <html>, which is exactly how ThemeProvider
    // toggles themes in the real app. Chromatic snapshots both via `modes`.
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      parentSelector: "html",
    }),
  ],

};

export default preview;
