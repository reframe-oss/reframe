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
  // Start hidden so the server-rendered markup matches the first client paint
  // (static export → no hydration mismatch); reveal after reading localStorage.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Genuinely needs an effect: localStorage is unavailable during SSR, so
    // this can't be computed as derived state without a hydration mismatch.
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      const dismissedUntil = raw ? Number(raw) : 0;
      if (!Number.isFinite(dismissedUntil) || Date.now() >= dismissedUntil) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (private mode, blocked storage) — show anyway.
      setVisible(true);
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
      className="relative flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 pr-11 animate-fade-in"
    >
      <ShieldCheck
        size={20}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[var(--accent)]"
      />
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="font-heading font-bold text-[var(--text)]">
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
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--border)] hover:text-[var(--text)]"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
