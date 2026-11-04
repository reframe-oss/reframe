"use client";

import { useCallback, useRef } from "react";
import { Upload, X } from "lucide-react";
import { BUILT_IN_FONTS } from "@/utils/fontLoader";
import { CustomFont } from "@/hooks/useFontManager";

interface FontSelectorProps {
  selectedFont?: string;
  onSelectFont: (fontName: string) => void;
  customFonts: CustomFont[];
  onAddFonts: (files: File[]) => Promise<{ success: number; errors: string[] }>;
  onRemoveFont: (name: string) => void;
  errors?: string[];
}

/**
 * Font selector component with built-in fonts and custom font upload.
 * Allows users to select from system fonts or upload custom font files.
 *
 * Features:
 * - Dropdown selector for built-in and custom fonts
 * - Font file upload button (TTF, OTF, WOFF, WOFF2)
 * - Visual feedback with font preview
 * - Error handling for invalid fonts
 * - Font removal for custom uploads
 *
 * @example
 * <FontSelector
 *   selectedFont="Inter"
 *   onSelectFont={(name) => updateOverlay({ fontFamily: name })}
 *   customFonts={customFonts}
 *   onAddFonts={addFonts}
 *   onRemoveFont={removeFont}
 *   errors={fontErrors}
 * />
 */
export default function FontSelector({
  selectedFont,
  onSelectFont,
  customFonts,
  onAddFonts,
  onRemoveFont,
  errors = [],
}: FontSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const builtInFontNames = BUILT_IN_FONTS.map(({ name }) => name);
  const allFonts = [
    ...builtInFontNames,
    ...customFonts.map((f) => f.name),
  ];

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const result = await onAddFonts(files);

      // Auto-select first successfully added font
      const firstFile = files[0];
      if (result.success > 0 && firstFile) {
        const fontName = firstFile.name.replace(/\.[^.]*$/, "").replace(/[-_\s]/g, "");
        onSelectFont(fontName);
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onAddFonts, onSelectFont]
  );

  return (
    <div className="space-y-2">
      {/* Font Selector Label */}
      <label htmlFor="font-select" className="text-xs text-[var(--muted)] font-medium block">
        Font
      </label>

      {/* Font Selector Dropdown */}
      <div className="flex gap-1">
        <select
          id="font-select"
          value={selectedFont || "Arial"}
          onChange={(e) => onSelectFont(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-film-500"
        >
          {builtInFontNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {customFonts.length > 0 && (
            <optgroup label="Custom Fonts">
              {customFonts.map(({ name }) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {/* Upload Font Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--border)] transition-colors"
          aria-label="Upload custom font"
          title="Upload TTF, OTF, WOFF, or WOFF2 font file"
        >
          <Upload size={14} />
        </button>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".ttf,.otf,.woff,.woff2"
          onChange={handleFileSelect}
          style={{ display: "none" }}
          aria-label="Font file upload"
        />
      </div>

      {/* Custom Fonts List with Remove Option */}
      {customFonts.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted)] font-medium">Custom Fonts</p>
          <div className="space-y-1">
            {customFonts.map(({ name }) => (
              <div
                key={name}
                className="flex items-center justify-between px-2 py-1 text-xs rounded bg-[var(--surface)] border border-[var(--border)]"
              >
                <span
                  className="font-medium text-[var(--text)]"
                  style={{ fontFamily: name }}
                >
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFont(name)}
                  className="p-1 rounded text-[var(--error)] hover:bg-[var(--error-bg)] transition-colors"
                  aria-label={`Remove ${name} font`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-[var(--border)]">
          {errors.map((error, idx) => (
            <p
              key={idx}
              className="text-xs text-[var(--error)] bg-[var(--error-bg)] px-2 py-1 rounded"
            >
              {error}
            </p>
          ))}
        </div>
      )}

      {/* Font Format Info */}
      <p className="text-xs text-[var(--muted)] italic">
        Supported formats: TTF, OTF, WOFF, WOFF2 (max 5MB)
      </p>
    </div>
  );
}
