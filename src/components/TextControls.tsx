"use client";

import { EditRecipe, TextOverlay } from "@/lib/types";
import { createDefaultTextOverlay } from "@/lib/text-overlay";
import { Trash2, Plus } from "lucide-react";
import { useMemo } from "react";
import FontSelector from "./FontSelector";
import ColorPicker from "./ColorPicker"
import { useFontManager } from "@/hooks/useFontManager";

interface TextControlsProps {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
  selectedTextId: string | null;
  onSelectText: (id: string | null) => void;
}

/**
 * Controls for managing text overlays on the video.
 * Allows users to add, remove, and select text overlays.
 */
export default function TextControls({
  recipe,
  onChange,
  selectedTextId,
  onSelectText,
}: TextControlsProps) {
  const { customFonts, addFonts, removeFont, getErrors } = useFontManager();

  /**
   * Always ensures textOverlays is an array, even if recipe is malformed.
   */
  const textOverlays = useMemo(
    (): TextOverlay[] => {
      const overlays = recipe?.textOverlays;
      return Array.isArray(overlays) ? overlays : [];
    },
    [recipe?.textOverlays]
  );

  /**
   * Adds a new text overlay to the recipe.
   */
  const handleAddText = () => {
    const newOverlay = createDefaultTextOverlay();
    const updatedOverlays = [...textOverlays, newOverlay];
    onChange({ textOverlays: updatedOverlays });
    onSelectText(newOverlay.id);
  };

  /**
   * Removes a text overlay from the recipe.
   */
  const handleRemoveText = (id: string) => {
    const updatedOverlays = textOverlays.filter((overlay) => overlay.id !== id);
    onChange({ textOverlays: updatedOverlays });
    if (selectedTextId === id) {
      onSelectText(null);
    }
  };

  /**
   * Updates a text overlay property.
   */
  const handleUpdateText = (id: string, updates: Partial<TextOverlay>) => {
    const updatedOverlays = textOverlays.map((overlay) =>
      overlay.id === id ? { ...overlay, ...updates } : overlay
    );
    onChange({ textOverlays: updatedOverlays });
  };

  /**
   * Get the currently selected overlay.
   */
  const selectedOverlay = useMemo(
    (): TextOverlay | undefined =>
      textOverlays.find((o) => o.id === selectedTextId),
    [textOverlays, selectedTextId]
  );

  return (
    <div className="w-full space-y-3">
      {/* Add Text Button */}
      <button
        type="button"
        onClick={handleAddText}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-semibold text-sm hover:bg-[var(--border)] transition-colors"
      >
        <Plus size={14} />
        Add Text
      </button>

      {/* Text Overlay List */}
      {textOverlays.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {textOverlays.map((overlay, idx) => (
            <div
              key={overlay.id}
              className={`flex items-center justify-between gap-2 p-2 rounded border transition-colors ${
                selectedTextId === overlay.id
                  ? "border-film-500 bg-film-600/10"
                  : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--border)]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectText(overlay.id)}
                className="flex-1 text-left text-xs truncate text-[var(--text)] font-medium"
              >
                {overlay.text || "(empty)"}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveText(overlay.id)}
                className="w-5 h-5 flex items-center justify-center rounded text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label={`Remove text overlay ${idx + 1}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Text Editing Controls */}
      {selectedOverlay && (
        <div className="space-y-3 pt-2 border-t border-[var(--border)]">
          {/* Text Input */}
          <div>
            <label htmlFor="text-input" className="text-xs text-[var(--muted)] font-medium mb-1 block">
              Text
            </label>
            <textarea
              id="text-input"
              value={selectedOverlay.text}
              onChange={(e) => handleUpdateText(selectedTextId!, { text: e.target.value })}
              placeholder="Enter text here"
              className="w-full px-2 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-film-500 resize-none"
              rows={2}
            />
          </div>

          {/* Font Selector */}
          <FontSelector
            selectedFont={selectedOverlay.fontFamily}
            onSelectFont={(fontName) =>
              handleUpdateText(selectedTextId!, { fontFamily: fontName })
            }
            customFonts={customFonts}
            onAddFonts={addFonts}
            onRemoveFont={removeFont}
            errors={getErrors()}
          />

          {/* Font Size Slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="font-size-slider" className="text-xs text-[var(--muted)] font-medium">
                Font Size
              </label>
              <span className="text-xs text-[var(--text)] font-semibold">
                {selectedOverlay.fontSize}px
              </span>
            </div>
            <input
              id="font-size-slider"
              type="range"
              min="12"
              max="120"
              step="2"
              value={selectedOverlay.fontSize}
              onChange={(e) =>
                handleUpdateText(selectedTextId!, {
                  fontSize: Number(e.target.value),
                })
              }
              className="w-full accent-film-600"
            />
          </div>

          {/* 🎨 Custom Glassmorphic Color Picker Implementation */}
          <div>
            <ColorPicker
              label="Text Color"
              value={selectedOverlay.color}
              onChange={(hex) => handleUpdateText(selectedTextId!, { color: hex })}
            />
          </div>

          {/* Font Weight */}
          <div>
            <legend className="text-xs text-[var(--muted)] font-medium mb-1 block">
              Weight
            </legend>
            <div className="grid grid-cols-3 gap-1">
              {(["normal", "bold", "900"] as const).map((weight) => (
                <button
                  key={weight}
                  type="button"
                  onClick={() =>
                    handleUpdateText(selectedTextId!, { fontWeight: weight })
                  }
                  className={`px-2 py-1.5 text-xs rounded border transition-colors ${
                    selectedOverlay.fontWeight === weight
                      ? "border-film-500 bg-film-600/10 text-film-400"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--border)]"
                  }`}
                  style={{
                    fontWeight: weight === "normal" ? 400 : weight === "bold" ? 700 : 900,
                  }}
                >
                  {weight === "900" ? "Heavy" : weight.charAt(0).toUpperCase() + weight.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// help