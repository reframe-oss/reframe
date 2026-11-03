"use client";

import { useEffect, useState } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { isMacPlatform } from "@/lib/historyShortcuts";

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

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
    <div role="group" aria-label="Edit history" className="flex items-center gap-1">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        aria-keyshortcuts={isMac ? "Meta+Z" : "Control+Z"}
        title={`Undo (${undoKeys})`}
        className="btn btn-ghost btn-sm"
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
        className="btn btn-ghost btn-sm"
      >
        <Redo2 size={14} aria-hidden="true" />
        Redo
      </button>
    </div>
  );
}
