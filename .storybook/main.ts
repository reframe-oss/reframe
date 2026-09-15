import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
  ],

  // The webpack-based Next.js framework (rather than nextjs-vite) is deliberate:
  // it reuses this project's own Next build pipeline, so PostCSS/Tailwind,
  // next/font/google (layout.tsx pulls in 7 families) and the "@/*" tsconfig
  // path alias all resolve exactly as they do in `next build`. That is what
  // keeps stories from rendering unstyled.
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },

  // Serves /public so favicon.svg, lottie JSON and other referenced assets
  // resolve at the same paths the app uses.
  staticDirs: ["../public"],

  typescript: {
    // Generates the props tables in docs from our TS interfaces.
    reactDocgen: "react-docgen-typescript",
  },

  core: {
    disableTelemetry: true,
  },
};

export default config;
