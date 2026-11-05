"use client";

import { EditRecipe, TextOverlay } from "@/lib/types";
import { createDefaultTextOverlay } from "@/lib/text-overlay";
import { captionOverlays, MAX_CAPTION_FILE_BYTES, parseCaptions } from "@/lib/captions";
import { MAX_TEXT_OVERLAYS } from "@/lib/project";
import { trackFeature } from "@/lib/featureTelemetry";
import { Trash2, Plus, Captions } from "lucide-react";
import { useMemo, useRef, useState, type RefObject } from "react";
import FontSelector from "./FontSelector";
import ColorPicker from "./ColorPicker"
import { useFontManager } from "@/hooks/useFontManager";

interface TextControlsProps {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
  selectedTextId: string | null;
  onSelectText: (id: string | null) => void;
  /** Source length in seconds (0 when unknown), for the timing fields. */
  duration?: number;
  /** The preview, for "Use playhead". */
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Output height in pixels, to size imported captions. */
  outputHeight?: number;
}

const timeInputClass =
  "w-full px-2 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-film-500 aria-[invalid=true]:border-[var(--error)]";

/** "12.5" for 12.5 s; "" for none. */
const showSeconds = (value: number | undefined) => (value === undefined ? "" : String(Number(value.toFixed(2))));

/** 0:12.5 */
export function formatCueTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${Number(s.toFixed(1))}`;
}

/**
 * A seconds field that only reports values that pass `validate`, so the edit
 * never holds a start after its end. While focused it keeps what is typed.
 */
function TimeField({
  label,
  shortLabel,
  value,
  placeholder,
  validate,
  onCommit,
}: {
  label: string;
  shortLabel: string;
  value: number | undefined;
  placeholder: string;
  validate: (value: number | undefined) => string | null;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = `text-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-2xs text-[var(--muted)]">
        {shortLabel}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.1}
        value={draft ?? showSeconds(value)}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onFocus={() => setDraft(showSeconds(value))}
        onBlur={() => {
          setDraft(null);
          setError(null);
        }}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const next = text.trim() === "" ? undefined : Number(text);
          const problem = next !== undefined && (!Number.isFinite(next) || next < 0) ? "Enter a time in seconds." : validate(next);
          setError(problem);
          if (!problem) onCommit(next);
        }}
        className={timeInputClass}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-2xs text-[var(--error)]">
          {error}
        </p>
      )}
    </div>
  );
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
  duration = 0,
  videoRef,
  outputHeight = 1080,
}: TextControlsProps) {
  const { customFonts, addFonts, removeFont, getErrors } = useFontManager();
  const captionInputRef = useRef<HTMLInputElement>(null);
  const [captionNotice, setCaptionNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

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
    const updatedOverlays = textOverlays.map((overlay) => {
      if (overlay.id !== id) return overlay;
      const next = { ...overlay, ...updates };
      // Cleared timing and box are left out, not stored as undefined.
      for (const key of ["start", "end", "box"] as const) if (next[key] === undefined) delete next[key];
      return next;
    });
    onChange({ textOverlays: updatedOverlays });
  };

  /** Adds one overlay per cue of an SRT or WebVTT file. */
  const handleImportCaptions = async (file: File) => {
    if (file.size > MAX_CAPTION_FILE_BYTES) {
      setCaptionNotice({ tone: "error", text: "That file is too large to be a caption file." });
      return;
    }
    const cues = parseCaptions(await file.text());
    if (cues.length === 0) {
      setCaptionNotice({ tone: "error", text: "No captions found. Use an .srt or .vtt file." });
      return;
    }
    const room = MAX_TEXT_OVERLAYS - textOverlays.length;
    if (room <= 0) {
      setCaptionNotice({ tone: "error", text: `The edit already has ${MAX_TEXT_OVERLAYS} text items, the most it can hold.` });
      return;
    }
    const added = captionOverlays(cues, outputHeight, room);
    onChange({ textOverlays: [...textOverlays, ...added] });
    onSelectText(null);
    trackFeature("text_tool", "import_captions");
    setCaptionNotice({
      tone: "info",
      text:
        added.length < cues.length
          ? `Added the first ${added.length} of ${cues.length} captions (an edit holds at most ${MAX_TEXT_OVERLAYS} text items).`
          : `Added ${added.length} caption${added.length === 1 ? "" : "s"}.`,
    });
  };

  const playhead = () => {
    const t = videoRef?.current?.currentTime;
    return typeof t === "number" && Number.isFinite(t) ? Number(t.toFixed(2)) : 0;
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
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleAddText}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-semibold text-sm hover:bg-[var(--border)] transition-colors"
        >
          <Plus size={14} />
          Add Text
        </button>
        <button
          type="button"
          onClick={() => captionInputRef.current?.click()}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-semibold text-sm hover:bg-[var(--border)] transition-colors"
        >
          <Captions size={14} />
          Import captions
        </button>
      </div>
      <input
        ref={captionInputRef}
        type="file"
        accept=".srt,.vtt,application/x-subrip,text/vtt"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="caption-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleImportCaptions(file);
        }}
      />
      {captionNotice && (
        <p role="status" className={`callout ${captionNotice.tone === "error" ? "callout-error" : "callout-info"} px-3 py-2 text-xs`}>
          {captionNotice.text}
        </p>
      )}

      {/* Text Overlay List */}
      {textOverlays.length > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>{textOverlays.length} text items</span>
          <button
            type="button"
            onClick={() => {
              onChange({ textOverlays: [] });
              onSelectText(null);
              setCaptionNotice(null);
            }}
            className="underline underline-offset-2 hover:text-[var(--text)]"
          >
            Remove all
          </button>
        </div>
      )}
      {textOverlays.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {textOverlays.map((overlay, idx) => (
            <div
              key={overlay.id}
              className={`flex items-center justify-between gap-2 p-2 rounded border transition-colors ${
                selectedTextId === overlay.id
                  ? "border-[var(--selected)] bg-[var(--selected-bg)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--border)]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectText(overlay.id)}
                className="flex min-w-0 flex-1 items-baseline gap-2 text-left text-xs text-[var(--text)] font-medium"
              >
                <span className="truncate">{overlay.text || "(empty)"}</span>
                {(overlay.start !== undefined || overlay.end !== undefined) && (
                  <span className="shrink-0 tabular-nums text-[var(--muted)] font-normal">
                    {formatCueTime(overlay.start ?? 0)}–{overlay.end !== undefined ? formatCueTime(overlay.end) : "end"}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveText(overlay.id)}
                className="w-5 h-5 flex items-center justify-center rounded text-[var(--error)] hover:bg-[var(--error-bg)] transition-colors"
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
                      ? "border-[var(--selected)] bg-[var(--selected-bg)] text-[var(--text)]"
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

          {/* When the text shows */}
          <fieldset>
            <legend className="text-xs text-[var(--muted)] font-medium mb-1 block">Shows (seconds of the video)</legend>
            <div className="grid grid-cols-2 gap-2">
              <TimeField
                key={`${selectedOverlay.id}-start`}
                label="Text shows from"
                shortLabel="From"
                value={selectedOverlay.start}
                placeholder="0 (start)"
                validate={(start) =>
                  start !== undefined && selectedOverlay.end !== undefined && start >= selectedOverlay.end
                    ? "Start before the end time."
                    : start !== undefined && duration > 0 && start >= duration
                      ? "Start before the video ends."
                      : null
                }
                onCommit={(start) => {
                  handleUpdateText(selectedOverlay.id, { start });
                  trackFeature("text_tool", "set_timing");
                }}
              />
              <TimeField
                key={`${selectedOverlay.id}-end`}
                label="Text shows until"
                shortLabel="Until"
                value={selectedOverlay.end}
                placeholder="End of video"
                validate={(end) =>
                  end !== undefined && end <= (selectedOverlay.start ?? 0) ? "End after the start time." : null
                }
                onCommit={(end) => {
                  handleUpdateText(selectedOverlay.id, { end });
                  trackFeature("text_tool", "set_timing");
                }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
              <button
                type="button"
                className="underline underline-offset-2 hover:text-[var(--text)]"
                onClick={() => {
                  const t = playhead();
                  const end = selectedOverlay.end !== undefined && selectedOverlay.end <= t ? undefined : selectedOverlay.end;
                  handleUpdateText(selectedOverlay.id, { start: t, end });
                  trackFeature("text_tool", "set_timing");
                }}
              >
                Start at playhead
              </button>
              <button
                type="button"
                className="underline underline-offset-2 hover:text-[var(--text)]"
                onClick={() => {
                  const t = playhead();
                  if (t <= (selectedOverlay.start ?? 0)) return;
                  handleUpdateText(selectedOverlay.id, { end: t });
                  trackFeature("text_tool", "set_timing");
                }}
              >
                End at playhead
              </button>
              {(selectedOverlay.start !== undefined || selectedOverlay.end !== undefined) && (
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-[var(--text)]"
                  onClick={() => handleUpdateText(selectedOverlay.id, { start: undefined, end: undefined })}
                >
                  Whole video
                </button>
              )}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-xs text-[var(--text)]">
            <input
              type="checkbox"
              checked={!!selectedOverlay.box}
              onChange={(e) => {
                handleUpdateText(selectedOverlay.id, { box: e.target.checked || undefined });
                if (e.target.checked) trackFeature("text_tool", "caption_box");
              }}
              className="accent-film-600"
            />
            Dark box behind the text (caption style)
          </label>
        </div>
      )}
    </div>
  );
}
