"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import {
  analyticsAllowed,
  browserDeclinesTracking,
  onAnalyticsChoiceChange,
  setAnalyticsChoice,
} from "@/lib/analyticsConsent";

/** The "Anonymous analytics" switch. Saved in this browser only. */
export default function AnalyticsSettings() {
  const labelId = useId();
  const descriptionId = useId();
  // Unknown until mounted: the page is prerendered without a browser.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [declined, setDeclined] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      setDeclined(browserDeclinesTracking());
      setEnabled(analyticsAllowed());
    };
    read();
    return onAnalyticsChoiceChange(read);
  }, []);

  const toggle = () => {
    if (enabled === null || declined) return;
    const next = !enabled;
    const saved = setAnalyticsChoice(next);
    setEnabled(next);
    setNotice(
      !saved
        ? "Your browser blocked saving this choice, so it applies to this page only."
        : next
          ? "Anonymous analytics is on. It starts on your next visit."
          : "Anonymous analytics is off. Nothing more is sent from this browser."
    );
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id={labelId} className="font-semibold text-[var(--text)]">
            Anonymous analytics
          </p>
          <p id={descriptionId} className="mt-1 text-sm text-[var(--muted)]">
            {declined
              ? "Off, because your browser sends Do Not Track or Global Privacy Control. Reframe respects that."
              : "Export success or failure, load times and errors, with no file names, captions or video content. Saved in this browser."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled === true}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          disabled={enabled === null || declined}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            enabled ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--bg)]"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>
      {notice && (
        <p role="status" className="mt-3 text-sm text-[var(--text)]">
          {notice}
        </p>
      )}
    </div>
  );
}
