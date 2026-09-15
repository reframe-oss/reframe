"use client";

import { useEffect, useState } from "react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Genuinely needs an effect: "has this mounted on the client" can't be
    // known during render without a server/client hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = theme === "dark";
  
  if (!mounted) {
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-label="Toggle theme"
        className="
          relative flex items-center justify-center
          w-9 h-9 rounded-full
          bg-[var(--surface)]
          border border-[var(--border)]
        "
      />
    );
  }

  return (
    <button
       type="button"
       suppressHydrationWarning={true}
       onClick={toggleTheme}
       aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="
        relative flex items-center justify-center
        w-9 h-9 rounded-full
        bg-[var(--surface)]
        text-[var(--text)]
        border border-[var(--border)]
        hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]
        focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2
        focus:ring-offset-[var(--bg)]
        transition-all duration-200
      "
    >
    {!mounted ? (
        <div className="w-4 h-4" /> 
      ) : isDark ? (
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
