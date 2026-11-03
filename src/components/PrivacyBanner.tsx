"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";

/** localStorage key holding the timestamp (ms) until which the banner stays hidden. */
const DISMISS_KEY = "reframe_privacy_banner_dismissed_until";
/** Keep the banner hidden for 7 days after it is dismissed. */
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dismissible notice shown above the upload area highlighting that all video
 * processing happens locally. Dismissal is remembered in localStorage and the
 * banner does not reappear for 7 days.
 */
export default function PrivacyBanner() {
  // Rendered visible in the static HTML so first-time visitors see no layout
  // shift (it used to mount hidden and appear after hydration, pushing the
  // upload area down — the page's only measured CLS). For visitors who
  // dismissed it, the inline script in layout.tsx sets
  // html[data-privacy-dismissed] before first paint, and CSS hides it.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Genuinely needs an effect: localStorage is unavailable during SSR.
    // Removes the (already CSS-hidden) node for dismissed visitors.
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      const dismissedUntil = raw ? Number(raw) : 0;
      if (Number.isFinite(dismissedUntil) && Date.now() < dismissedUntil) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVisible(false);
      }
    } catch {
      // localStorage unavailable (private mode, blocked storage) — keep showing.
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DURATION_MS)
      );
    } catch {
      // Ignore write failures — dismissal simply won't persist across reloads.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="note"
      aria-label="Privacy information"
      data-privacy-banner=""
      // Hairlines above and below instead of a card; same footprint as before
      // so the pre-paint hide/show never shifts layout.
      className="enter relative flex items-start gap-3 border-y border-[var(--border)] py-4 pl-1 pr-11"
      style={{ "--enter-delay": "320ms" } as React.CSSProperties}
    >
      <ShieldCheck
        size={18}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[var(--success)]"
      />
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="font-medium text-[var(--text)]">
          Your videos never leave your device.
        </p>
        <p className="mt-0.5 text-[var(--muted)]">
          Processing is done entirely in your browser using FFmpeg.wasm. No
          server, no upload, no account required.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss privacy notice"
        title="Dismiss for 7 days"
        className="btn btn-ghost btn-icon btn-sm absolute right-2 top-2"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
