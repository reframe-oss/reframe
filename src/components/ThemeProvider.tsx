"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";
type Contrast = "standard" | "more";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  contrast: Contrast;
  toggleContrast: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/** How long colours crossfade after an explicit theme/contrast change. */
const THEME_TRANSITION_MS = 200;

function getCurrentTheme(): Theme {
  if (typeof window !== "undefined") {
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }

    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  }

  return "light";
}

function getCurrentContrast(): Contrast {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("contrast");
    if (saved === "more" || saved === "standard") return saved;
    if (window.matchMedia("(prefers-contrast: more)").matches) return "more";
  }
  return "standard";
}

/**
 * Colour transitions are enabled only for a short window around an explicit
 * toggle — never permanently on every element, which made ordinary
 * interaction pay for transitions it didn't need.
 */
function withThemeTransition(apply: () => void) {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) root.classList.add("theme-transition");
  apply();
  if (!reduceMotion) {
    window.setTimeout(() => root.classList.remove("theme-transition"), THEME_TRANSITION_MS);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [contrast, setContrastState] = useState<Contrast>("standard");

  const applyTheme = useCallback(
    (next: Theme, persist = true) => {
      setThemeState(next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      if (persist) {
        localStorage.setItem("theme", next);
      }
    },
    []
  );

  const applyContrast = useCallback((next: Contrast, persist = true) => {
    setContrastState(next);
    if (next === "more") {
      document.documentElement.dataset.theme = "high-contrast";
    } else {
      delete document.documentElement.dataset.theme;
    }
    if (persist) {
      localStorage.setItem("contrast", next);
    }
  }, []);

  useEffect(() => {
    // Genuinely needs an effect: getCurrentTheme() reads localStorage and
    // matchMedia, browser-only APIs unavailable during SSR/render.
    const currentTheme = getCurrentTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyTheme(currentTheme, false);
    applyContrast(getCurrentContrast(), false);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("theme")) {
        applyTheme(e.matches ? "dark" : "light", false);
      }
    };
    const contrastMq = window.matchMedia("(prefers-contrast: more)");
    const contrastHandler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("contrast")) {
        applyContrast(e.matches ? "more" : "standard", false);
      }
    };
    mq.addEventListener("change", handler);
    contrastMq.addEventListener("change", contrastHandler);
    return () => {
      mq.removeEventListener("change", handler);
      contrastMq.removeEventListener("change", contrastHandler);
    };
  }, [applyTheme, applyContrast]);

  const toggleTheme = useCallback(() => {
    withThemeTransition(() => applyTheme(theme === "light" ? "dark" : "light"));
  }, [theme, applyTheme]);

  const setTheme = useCallback(
    (next: Theme) => withThemeTransition(() => applyTheme(next)),
    [applyTheme]
  );

  const toggleContrast = useCallback(() => {
    withThemeTransition(() => applyContrast(contrast === "more" ? "standard" : "more"));
  }, [contrast, applyContrast]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, contrast, toggleContrast }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
