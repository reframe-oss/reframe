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
      // Two families. The platform UI font (SF Pro / Segoe UI / Roboto) for
      // every control, label and readout; an editorial serif (Cormorant
      // Garamond, self-hosted by next/font) for headings and a few numerals.
      // `heading` stays sans: it is used on small control labels.
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-sans)"],
        display: ["var(--font-serif)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        // Type scale: metadata → helper → label/body → section → page title.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }], // 11px
        xs: ["0.75rem", { lineHeight: "1.125rem" }], // 12px
        sm: ["0.8125rem", { lineHeight: "1.25rem" }], // 13px
        base: ["0.9375rem", { lineHeight: "1.5rem" }], // 15px
        lg: ["1.0625rem", { lineHeight: "1.5rem" }], // 17px
        xl: ["1.25rem", { lineHeight: "1.75rem" }], // 20px
        "2xl": ["1.625rem", { lineHeight: "2rem", letterSpacing: "-0.015em" }], // 26px
        "3xl": ["2.125rem", { lineHeight: "2.5rem", letterSpacing: "-0.02em" }], // 34px
        // Serif display sizes (headlines and the export percentage).
        "4xl": ["2.75rem", { lineHeight: "1.02", letterSpacing: "-0.02em" }], // 44px
        "5xl": ["3.75rem", { lineHeight: "1", letterSpacing: "-0.025em" }], // 60px
        "6xl": ["4.75rem", { lineHeight: "0.98", letterSpacing: "-0.03em" }], // 76px
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Reframe's film-red accent. Text-weight shades (300–500, 700–900) use
        // --accent-text, which is tuned per theme for AA contrast on surfaces;
        // 600 is the solid fill used behind --on-accent text.
        film: {
          50: "var(--accent-muted)",
          100: "var(--accent-muted)",
          200: "color-mix(in srgb, var(--accent) 30%, var(--border))",
          300: "color-mix(in srgb, var(--accent) 55%, var(--border))",
          400: "var(--accent-text)",
          500: "var(--accent-text)",
          600: "var(--accent)",
          700: "var(--accent-text)",
          800: "var(--text)",
          900: "var(--text)",
          950: "var(--bg)",
        },
      },
      borderRadius: {
        control: "var(--radius-control)",
        panel: "var(--radius-panel)",
        pill: "var(--radius-pill)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
        panel: "var(--dur-panel)",
        enter: "var(--dur-enter)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // Used ~20 times via `animate-fade-in` but previously undefined.
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 2s infinite",
        "fade-in": "fade-in var(--dur-base) var(--ease-standard) both",
      },
    },
  },
  plugins: [],
};

export default config;
