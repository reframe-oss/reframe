"use client";

import { TextOverlay, EditRecipe } from "@/lib/types";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { getTextPixelPosition, getTextPercentPosition } from "@/lib/text-overlay";
import { getFontFamily, ensureFontLoaded } from "@/utils/fontLoader";

interface DraggableTextOverlaysProps {
  recipe?: EditRecipe;
  containerWidth: number;
  containerHeight: number;
  selectedTextId: string | null;
  onUpdateText: (id: string, updates: Partial<TextOverlay>) => void;
  onSelectText: (id: string | null) => void;
}

export default function DraggableTextOverlays({
  recipe,
  containerWidth,
  containerHeight,
  selectedTextId,
  onUpdateText,
  onSelectText,
}: DraggableTextOverlaysProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [fontUpdateTrigger, setFontUpdateTrigger] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLDivElement>(null);

  /**
   * Memoize text overlays to prevent unnecessary dependency changes.
   * Always ensures textOverlays is an array, even if recipe is malformed.
   */
  const textOverlays = useMemo(() => {
    const overlays = recipe?.textOverlays;
    return Array.isArray(overlays) ? overlays : [];
  }, [recipe?.textOverlays]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, overlayId: string) => {
      e.preventDefault();
      e.stopPropagation();

      const overlay = textOverlays.find((o) => o.id === overlayId);
      if (!overlay || !containerRef.current) return;

      onSelectText(overlayId);

      const rect = containerRef.current.getBoundingClientRect();
      const { left: pixelX, top: pixelY } = getTextPixelPosition(
        overlay.x,
        overlay.y,
        containerWidth,
        containerHeight
      );

      setDraggingId(overlayId);
      setDragOffset({
        x: e.clientX - rect.left - pixelX,
        y: e.clientY - rect.top - pixelY,
      });
    },
    [textOverlays, containerWidth, containerHeight, onSelectText]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, overlayId: string) => {
      e.preventDefault();
      e.stopPropagation();

      const overlay = textOverlays.find((o) => o.id === overlayId);
      if (!overlay) return;

      setEditingId(overlayId);
      setEditText(overlay.text);
    },
    [textOverlays]
  );

  
  const handleSaveEdit = useCallback(
    (overlayId: string) => {
      if (editText.trim()) {
        onUpdateText(overlayId, { text: editText });
      }
      setEditingId(null);
      setEditText("");
    },
    [editText, onUpdateText]
  );

  
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, overlayId: string) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSaveEdit(overlayId);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditingId(null);
        setEditText("");
      }
    },
    [handleSaveEdit]
  );

  useEffect(() => {
    if (!draggingId || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const pixelX = e.clientX - rect.left - dragOffset.x;
      const pixelY = e.clientY - rect.top - dragOffset.y;

      const { x: percentX, y: percentY } = getTextPercentPosition(
        pixelX,
        pixelY,
        containerWidth,
        containerHeight
      );

      onUpdateText(draggingId, { x: percentX, y: percentY });
    };

    const handleMouseUp = () => {
      setDraggingId(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingId, dragOffset, containerWidth, containerHeight, onUpdateText]);

  /**
   * Ensure custom fonts are loaded when overlays render.
   * This prevents fallback font flashing and ensures preview accuracy.
   * Runs whenever overlays change to keep fonts fresh.
   * Also triggers re-render to ensure font changes are visible immediately.
   */
  useEffect(() => {
    const loadFonts = async () => {
      // Collect unique fonts from all overlays
      const fontsToLoad = new Set<string>();
      textOverlays.forEach((overlay) => {
        if (overlay.fontFamily) {
          fontsToLoad.add(overlay.fontFamily);
        }
      });

      // Load all fonts in parallel
      if (fontsToLoad.size > 0) {
        await Promise.all(
          Array.from(fontsToLoad).map((fontName) =>
            ensureFontLoaded(fontName, 16)
          )
        );
        // Trigger re-render after fonts are loaded
        // This ensures font changes are visible immediately
        setFontUpdateTrigger((prev) => prev + 1);
      }
    };

    if (textOverlays.length > 0) {
      loadFonts().catch((err) => {
        // Silently handle font loading errors
        console.warn("Error loading fonts:", err);
      });
    }
  }, [textOverlays]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      // Set the initial text content
      editInputRef.current.textContent = editText;
      editInputRef.current.focus();
      // Select all text for quick replacement
      const range = document.createRange();
      range.selectNodeContents(editInputRef.current);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [editingId, editText]);

  if (!textOverlays || textOverlays.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {textOverlays.map((overlay) => {
        const { left, top } = getTextPixelPosition(
          overlay.x,
          overlay.y,
          containerWidth,
          containerHeight
        );

        const isSelected = selectedTextId === overlay.id;
        const isDragging = draggingId === overlay.id;

        return (
          <div
            key={`${overlay.id}-${fontUpdateTrigger}`}
            role="button"
            tabIndex={0}
            onMouseDown={(e) => handleMouseDown(e, overlay.id)}
            onDoubleClick={(e) => handleDoubleClick(e, overlay.id)}
            onKeyDown={(e) => {
              if (editingId === overlay.id) {
                handleEditKeyDown(e, overlay.id);
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectText(overlay.id);
              }
            }}
            className={`absolute pointer-events-auto ${
              editingId === overlay.id ? "cursor-text" : "cursor-move"
            } select-none transition-all ${
              isDragging ? "scale-105" : "scale-100"
            } ${
              isSelected
                ? "ring-2 ring-film-500 ring-offset-1 ring-offset-black/50"
                : ""
            }`}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              transform: "translate(-50%, -50%)",
              fontSize: `${overlay.fontSize}px`,
              color: overlay.color,
              fontFamily: getFontFamily(overlay.fontFamily),
              fontWeight:
                overlay.fontWeight === "900"
                  ? 900
                  : overlay.fontWeight === "bold"
                  ? 700
                  : 400,
              textShadow: "0 2px 8px rgba(0, 0, 0, 0.8)",
              whiteSpace: "nowrap",
            }}
            aria-label={`Text overlay: ${overlay.text}`}
            aria-pressed={isSelected}
          >
            {editingId === overlay.id ? (
              <div
                ref={editInputRef}
                contentEditable
                suppressContentEditableWarning
                onBlur={() => handleSaveEdit(overlay.id)}
                onInput={(e) => setEditText(e.currentTarget.textContent || "")}
                className="outline-none bg-black/30 px-1 py-0.5 rounded"
                style={{
                  color: overlay.color,
                  fontSize: `${overlay.fontSize}px`,
                  fontFamily: getFontFamily(overlay.fontFamily),
                  fontWeight:
                    overlay.fontWeight === "900"
                      ? 900
                      : overlay.fontWeight === "bold"
                      ? 700
                      : 400,
                  textShadow: "0 2px 8px rgba(0, 0, 0, 0.8)",
                }}
              >
              </div>
            ) : (
              overlay.text
            )}
          </div>
        );
      })}
    </div>
  );
}
