import { EditRecipe, ExportStatus } from "@/lib/types";
import { PRESETS } from "@/lib/presets";
import { useEffect } from "react";
import { isMacPlatform, isTextEntryTarget, matchHistoryShortcut } from "@/lib/historyShortcuts";

interface UseKeyboardShortcutsProps {
  file: File | null;
  recipe: EditRecipe;
  resetSettings: () => void;
  updateRecipe: (recipe: Partial<EditRecipe>) => void;
  handleExport: () => void;
  status: ExportStatus;
  cancelExport: () => void;
  onToggleShortcutsModal: () => void;
  /** Reads the playhead at key-press time (no per-frame re-subscription). */
  getCurrentTime: () => number;
  duration: number;
  undo?: () => void;
  redo?: () => void;
}

export function useKeyboardShortcuts({
  file,
  recipe,
  resetSettings,
  updateRecipe,
  handleExport,
  status,
  cancelExport,
  onToggleShortcutsModal,
  getCurrentTime,
  duration,
  undo,
  redo,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/redo works from sliders and buttons too, but never steals the
      // browser's own text undo while the user is typing.
      const historyAction = matchHistoryShortcut(e, isMacPlatform());
      if (historyAction && file && !isTextEntryTarget(e.target)) {
        e.preventDefault();
        if (historyAction === "undo") undo?.();
        else redo?.();
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) return;

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (isCtrlOrCmd && e.shiftKey && e.key === "E") {
        e.preventDefault();
        e.stopPropagation();
        if (file && status === "idle") handleExport();
        return;
      }

      if (!file) return;

      switch (e.key) {
        case "m":
        case "M":
          updateRecipe({ keepAudio: !recipe.keepAudio });
          break;

        case "r":
        case "R":
          resetSettings();
          break;

        case "Escape":
          if (status === "exporting") cancelExport();
          break;

        case "?":
          onToggleShortcutsModal();
          break;
        case "i":
        case "I":
          updateRecipe({ trimStart: Math.floor(getCurrentTime()) });
          break;
        case "o":
        case "O":
          updateRecipe({ trimEnd: Math.floor(getCurrentTime()) });
          break;

        default:
          if (e.key >= "1" && e.key <= "9") {
            const index = parseInt(e.key) - 1;
            if (PRESETS[index]) {
              updateRecipe({ preset: PRESETS[index].id });
            }
          }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file, recipe, resetSettings, updateRecipe, handleExport, status, cancelExport, onToggleShortcutsModal, getCurrentTime, duration, undo, redo]);
}
