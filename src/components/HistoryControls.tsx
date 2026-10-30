"use client";

import { useEffect, useState } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isMacPlatform } from "@/lib/historyShortcuts";

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const buttonClass =
  "inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-heading font-bold uppercase tracking-widest transition-colors";

export default function HistoryControls({ canUndo, canRedo, onUndo, onRedo }: Props) {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    // navigator is browser-only, so the platform can't be read during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(isMacPlatform());
  }, []);

  const undoKeys = isMac ? "⌘Z" : "Ctrl+Z";
  const redoKeys = isMac ? "⇧⌘Z" : "Ctrl+Y";

  return (
    <div role="group" aria-label="Edit history" className="flex items-center gap-2">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        aria-keyshortcuts={isMac ? "Meta+Z" : "Control+Z"}
        title={`Undo (${undoKeys})`}
        className={cn(
          buttonClass,
          canUndo
            ? "text-[var(--text)] hover:bg-[var(--border)]"
            : "text-[var(--muted)] opacity-50 cursor-not-allowed"
        )}
      >
        <Undo2 size={14} aria-hidden="true" />
        Undo
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        aria-keyshortcuts={isMac ? "Shift+Meta+Z" : "Control+Y Control+Shift+Z"}
        title={`Redo (${redoKeys})`}
        className={cn(
          buttonClass,
          canRedo
            ? "text-[var(--text)] hover:bg-[var(--border)]"
            : "text-[var(--muted)] opacity-50 cursor-not-allowed"
        )}
      >
        <Redo2 size={14} aria-hidden="true" />
        Redo
      </button>
    </div>
  );
}
