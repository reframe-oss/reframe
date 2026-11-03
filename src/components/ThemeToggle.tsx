"use client";

import { useEffect, useState } from "react";
import { Contrast, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Genuinely needs an effect: "has this mounted on the client" can't be
    // known during render without a server/client hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  return mounted;
}

// Hairline circles, matching weight and size in the header.
const iconButton = "btn btn-secondary btn-icon btn-sm";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const mounted = useMounted();

  const isDark = theme === "dark";

  if (!mounted) {
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-label="Toggle theme"
        className={iconButton}
      />
    );
  }

  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      suppressHydrationWarning={true}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={iconButton}
    >
      {isDark ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}
    </button>
  );
}

/** Toggles the high-contrast palette (defaults to the OS `prefers-contrast` setting). */
export function ContrastToggle() {
  const { contrast, toggleContrast } = useTheme();
  const mounted = useMounted();
  const isMore = contrast === "more";

  if (!mounted) {
    return <button type="button" tabIndex={-1} aria-label="Toggle high contrast" className={iconButton} />;
  }

  return (
    <button
      type="button"
      onClick={toggleContrast}
      aria-pressed={isMore}
      aria-label="High contrast"
      title={isMore ? "Turn off high contrast" : "Turn on high contrast"}
      className={iconButton}
    >
      <Contrast size={14} aria-hidden="true" />
    </button>
  );
}
