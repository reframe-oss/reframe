import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class", // Enable class-based dark mode
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Added files to catch utility strings hidden in hooks, providers, or custom UI state contexts
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/context/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    // Storybook decorators use Tailwind utilities too; without this the
    // preview wrapper renders unstyled while the app looks fine.
    "./.storybook/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        film: {
          50: "var(--accent-muted)",
          100: "var(--accent-muted)",
          200: "color-mix(in srgb, var(--accent) 30%, var(--border))",
          300: "color-mix(in srgb, var(--accent) 55%, var(--border))",
          400: "var(--accent)",
          500: "var(--accent)",
          600: "var(--accent)",
          700: "var(--accent-hover)",
          800: "var(--text)",
          900: "var(--text)",
          950: "var(--bg)",
        },
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
