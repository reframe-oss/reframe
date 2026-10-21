"use client";

import { useEffect, useState } from "react";
import { Contrast } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

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

const iconButton = "btn btn-ghost btn-icon";

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
      {isDark ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
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
      className={cn(iconButton, isMore && "text-[var(--accent-text)]")}
    >
      <Contrast size={16} aria-hidden="true" />
    </button>
  );
}
