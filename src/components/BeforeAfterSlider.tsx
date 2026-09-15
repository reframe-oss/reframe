"use client";

import { useRef, useState, useCallback, useEffect, RefObject } from "react";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  filterStyle: string;
}

export default function BeforeAfterSlider({ videoRef, filterStyle }: Props) {
  const [dividerX, setDividerX] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    setDividerX((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragging.current) updatePosition(e.clientX);
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [updatePosition]);

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (dragging.current) updatePosition(e.touches[0].clientX);
    };
    const onTouchEnd = () => { dragging.current = false; };
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [updatePosition]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setDividerX((x) => Math.max(0, x - 1));
    if (e.key === "ArrowRight") setDividerX((x) => Math.min(100, x + 1));
  };

  const video = videoRef.current;
  if (!video) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      {/* After side: same video with filter, clipped to right of divider */}
      <video
        src={video.src}
        muted
        autoPlay
        loop
        playsInline
        style={{
          filter: filterStyle,
          clipPath: `inset(0 0 0 ${dividerX}%)`,
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none",
        }}
      />

      {/* Before label */}
      <div
        className="absolute top-2 px-2 py-0.5 text-[10px] font-heading font-bold uppercase tracking-wider bg-black/60 text-white/80 rounded"
        style={{ left: "8px", opacity: dividerX > 10 ? 1 : 0 }}
      >
        Before
      </div>

      {/* After label */}
      <div
        className="absolute top-2 px-2 py-0.5 text-[10px] font-heading font-bold uppercase tracking-wider bg-black/60 text-white/80 rounded"
        style={{ right: "8px", opacity: dividerX < 90 ? 1 : 0 }}
      >
        After
      </div>

      {/* Draggable divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-lg pointer-events-auto cursor-ew-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-film-400"
        style={{ left: `${dividerX}%`, transform: "translateX(-50%)" }}
        onMouseDown={(e) => { dragging.current = true; updatePosition(e.clientX); }}
        onTouchStart={(e) => { dragging.current = true; updatePosition(e.touches[0].clientX); }}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="slider"
        aria-valuenow={Math.round(dividerX)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Before/after divider"
      >
        {/* Handle knob */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M5 8H1M11 8h4M5 5l-4 3 4 3M11 5l4 3-4 3" stroke="#444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
}