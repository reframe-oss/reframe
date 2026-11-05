"use client";

import { CloudOff, RefreshCw, X } from "lucide-react";
import { useOfflineSupport, type OfflineState } from "@/hooks/useOfflineSupport";

const TEXT: Record<Exclude<OfflineState, "unavailable">, string> = {
  preparing: "Saving the editor for offline use…",
  "needs-engine": "Open a video once while online to use the editor offline.",
  ready: "Works offline",
};

/**
 * Whether the editor opens offline (in the footer), and a small notice when
 * a new version is ready to load.
 */
export default function OfflineStatus() {
  const { state, updateReady, applyUpdate, dismissUpdate } = useOfflineSupport();
  return (
    <>
      {state !== "unavailable" && (
        <p className="flex items-center gap-1.5 text-2xs text-[var(--muted)]" data-testid="offline-status" data-state={state}>
          <CloudOff size={12} aria-hidden="true" />
          {TEXT[state]}
        </p>
      )}
      {updateReady && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-pill border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs shadow-sm"
        >
          <span>A new version of Reframe is ready.</span>
          <button type="button" className="inline-flex items-center gap-1 font-medium underline underline-offset-2" onClick={applyUpdate}>
            <RefreshCw size={12} aria-hidden="true" />
            Reload
          </button>
          <button type="button" className="text-[var(--muted)]" aria-label="Dismiss" onClick={dismissUpdate}>
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
