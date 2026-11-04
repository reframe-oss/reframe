"use client";

import { useRef } from "react";
import { clampCrop, dragCrop, FULL_FRAME, type CropHandle, type CropRect } from "@/lib/crop";
import { sourceRect } from "@/lib/framing";
import { trackFeature } from "@/lib/featureTelemetry";

interface Props {
  crop: CropRect | null | undefined;
  /** Aspect (width / height, pixels) to keep while resizing; null is free-form. */
  ratio: number | null;
  sourceRatio: number;
  onChange: (crop: CropRect) => void;
}

const HANDLES: { id: Exclude<CropHandle, "move">; className: string; cursor: string }[] = [
  { id: "nw", className: "left-0 top-0", cursor: "nwse-resize" },
  { id: "ne", className: "right-0 top-0", cursor: "nesw-resize" },
  { id: "sw", className: "left-0 bottom-0", cursor: "nesw-resize" },
  { id: "se", className: "right-0 bottom-0", cursor: "nwse-resize" },
  { id: "n", className: "left-1/2 top-0 -translate-x-1/2", cursor: "ns-resize" },
  { id: "s", className: "left-1/2 bottom-0 -translate-x-1/2", cursor: "ns-resize" },
  { id: "w", className: "left-0 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { id: "e", className: "right-0 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

const pct = (n: number) => `${n * 100}%`;

/**
 * The crop box over the preview: drag inside it to move it, drag an edge or
 * corner to resize. Arrow keys move it by 1% (Shift: 5%) when focused. The
 * box sits over the source picture, which the viewer letterboxes.
 */
export default function CropOverlay({ crop, ratio, sourceRatio, onChange }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: CropHandle; x: number; y: number; start: CropRect; moved: boolean } | null>(null);
  const rect = crop ?? FULL_FRAME;
  const inset = sourceRect(sourceRatio);

  // One handler for the box and its handles: a handle's data-handle says
  // which edge or corner it is; anywhere else in the box moves it.
  const begin = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = ((e.target as HTMLElement).dataset.handle as CropHandle | undefined) ?? "move";
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, start: rect, moved: false };
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = area.current?.getBoundingClientRect();
    if (!d || !box || box.width === 0 || box.height === 0) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 0.002) {
      d.moved = true;
      trackFeature("crop_tool", "drag");
    }
    onChange(dragCrop(d.start, d.handle, dx, dy, ratio, sourceRatio));
  };

  const end = () => {
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(clampCrop({ ...rect, x: rect.x + d[0], y: rect.y + d[1] }));
  };

  return (
    <div
      ref={area}
      data-testid="crop-area"
      className="absolute"
      style={{ top: `${inset.top}%`, bottom: `${inset.bottom}%`, left: `${inset.left}%`, right: `${inset.right}%` }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* Dim what the crop removes. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 bg-black/60" style={{ height: pct(rect.y) }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60" style={{ height: pct(1 - rect.y - rect.height) }} />
      <div aria-hidden="true" className="pointer-events-none absolute left-0 bg-black/60" style={{ top: pct(rect.y), height: pct(rect.height), width: pct(rect.x) }} />
      <div aria-hidden="true" className="pointer-events-none absolute right-0 bg-black/60" style={{ top: pct(rect.y), height: pct(rect.height), width: pct(1 - rect.x - rect.width) }} />

      <div
        role="button"
        aria-roledescription="crop box"
        aria-label="Crop area. Drag to move, or use the arrow keys."
        tabIndex={0}
        data-testid="crop-box"
        onKeyDown={onKeyDown}
        onPointerDown={begin}
        className="absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.width), height: pct(rect.height) }}
      >
        {/* Rule of thirds inside the crop. Handles sit just inside the box, so the viewer's edge never clips them. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
        </div>
        {HANDLES.map((h) => (
          <span
            key={h.id}
            aria-hidden="true"
            data-handle={h.id}
            className={`absolute size-3.5 touch-none rounded-[2px] border border-black/40 bg-white ${h.className}`}
            style={{ cursor: h.cursor }}
          />
        ))}
      </div>
    </div>
  );
}
