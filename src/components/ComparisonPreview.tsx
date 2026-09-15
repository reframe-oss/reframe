"use client";

import { useEffect, useRef, useState, useCallback, CSSProperties, RefObject } from "react";
import { EditRecipe } from "@/lib/types";
import { getPresetById } from "@/lib/presets";
import { cn } from "@/lib/utils";

interface Props {
  file: File | null;
  recipe?: EditRecipe;
  videoRef: RefObject<HTMLVideoElement | null>;
}

const CONTAINER_RATIO = 16 / 9; // matches the `aspect-video` wrapper below

export default function ComparisonPreview({ file, recipe, videoRef }: Props) {
  const leftVideoRef = useRef<HTMLVideoElement>(null);
  const rightVideoRef = useRef<HTMLVideoElement>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rightFrameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  // Resolve the actual output pixel dimensions the export will produce.
  const targetDims = (() => {
    if (!recipe) return null;
    const dims =
      recipe.preset === "custom"
        ? { width: recipe.customWidth, height: recipe.customHeight }
        : getPresetById(recipe.preset);
    if (!dims || dims.width <= 0 || dims.height <= 0) return null;
    return dims;
  })();

  const rotated = recipe?.rotate === 90 || recipe?.rotate === 270;

  // Size the "target frame" box so it's letterboxed/pillarboxed inside the
  // 16:9 comparison view exactly like the real output dimensions would be,
  // without distorting the aspect ratio.
  const frameStyle: CSSProperties = (() => {
    if (!targetDims) return { width: "100%", height: "100%" };

    const outputRatio = targetDims.width / targetDims.height;
    const aspectRatio = `${targetDims.width} / ${targetDims.height}`;

    return outputRatio >= CONTAINER_RATIO
      ? { width: "100%", height: "auto", aspectRatio }
      : { width: "auto", height: "100%", aspectRatio };
  })();

  // Track the rendered pixel size of the target frame. Needed so a 90/270
  // rotation can be applied to the video correctly (CSS percentages can't
  // express "swap my width and height relative to my own box").
  useEffect(() => {
    const el = rightFrameRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setFrameSize({ width: rect.width, height: rect.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [targetDims?.width, targetDims?.height]);

  // Load video source for both left (original) and right (reframed) videos
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);

    if (leftVideoRef.current) {
      leftVideoRef.current.src = url;
      leftVideoRef.current.load();
    }
    if (rightVideoRef.current) {
      rightVideoRef.current.src = url;
      rightVideoRef.current.load();
    }

    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Keep the right video's playhead locked to the left (original) video.
  useEffect(() => {
    const leftVideo = leftVideoRef.current;
    const rightVideo = rightVideoRef.current;

    if (!leftVideo || !rightVideo || !file) return;

    const handleTimeUpdate = () => {
      if (Math.abs(rightVideo.currentTime - leftVideo.currentTime) > 0.05) {
        rightVideo.currentTime = leftVideo.currentTime;
      }
    };

    const handleSeeking = () => {
      rightVideo.currentTime = leftVideo.currentTime;
    };

    const handlePlay = () => {
      rightVideo.play().catch(() => {});
    };

    const handlePause = () => {
      rightVideo.pause();
    };

    const handleLoadedData = () => {
      leftVideo.play().catch(() => {});
    };

    leftVideo.addEventListener("timeupdate", handleTimeUpdate);
    leftVideo.addEventListener("seeking", handleSeeking);
    leftVideo.addEventListener("play", handlePlay);
    leftVideo.addEventListener("pause", handlePause);
    leftVideo.addEventListener("loadeddata", handleLoadedData);

    return () => {
      leftVideo.removeEventListener("timeupdate", handleTimeUpdate);
      leftVideo.removeEventListener("seeking", handleSeeking);
      leftVideo.removeEventListener("play", handlePlay);
      leftVideo.removeEventListener("pause", handlePause);
      leftVideo.removeEventListener("loadeddata", handleLoadedData);
    };
  }, [file, videoRef]);

  // Handle slider dragging (mouse + touch)
  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const container = containerRef.current;
      if (!container || !e.touches[0]) return;

      const rect = container.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchend", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging]);

  if (!file) return null;

  // Pre-rotation video box. When rotate is 90/270 the video's own box must
  // be the *swapped* pixel dimensions of the frame so that, once rotated,
  // it exactly fills the frame (percentages can't express this swap).
  const videoStyle: CSSProperties =
    rotated && frameSize.width > 0 && frameSize.height > 0
      ? {
          position: "absolute",
          top: "50%",
          left: "50%",
          width: `${frameSize.height}px`,
          height: `${frameSize.width}px`,
          transform: `translate(-50%, -50%) rotate(${recipe?.rotate}deg)`,
          objectFit: recipe?.framing === "fill" ? "cover" : "contain",
          filter: colorFilter(recipe),
        }
      : {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: recipe?.framing === "fill" ? "cover" : "contain",
          filter: colorFilter(recipe),
        };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-hidden bg-[#0a0a0a] aspect-video"
      role="group"
      aria-label="Video comparison preview"
    >
      {/* Left side: Original, unmodified video — clipped to left of slider */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPosition}%` }}>
        <video
          ref={leftVideoRef}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          muted
        >
          <track kind="captions" />
        </video>
        <span className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-white text-[10px] font-heading font-bold uppercase tracking-wider pointer-events-none">
          Original
        </span>
      </div>

      {/* Right side: Reframed preview — real crop/letterbox via CSS, matching the export pipeline */}
      <div className="absolute inset-0 overflow-hidden" style={{ left: `${sliderPosition}%` }}>
        <div className="absolute inset-0" style={{ left: `-${sliderPosition}%`, right: 0 }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              ref={rightFrameRef}
              className="relative bg-black border border-white/10 overflow-hidden"
              style={frameStyle}
            >
                    <video ref={rightVideoRef} style={videoStyle} playsInline muted autoPlay loop>
                <track kind="captions" />
              </video>
            </div>
          </div>
        </div>

        <span className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-[10px] font-heading font-bold uppercase tracking-wider pointer-events-none text-right">
          Reframed
          {targetDims && (
            <>
              {" · "}
              {recipe?.framing === "fill" ? "Fill" : "Fit"}
              {" · "}
              {targetDims.width}×{targetDims.height}
            </>
          )}
        </span>
      </div>

      {/* Draggable divider slider */}
      <div
        className={cn(
          "absolute top-0 bottom-0 w-1 bg-white pointer-events-none transition-opacity",
          isDragging ? "opacity-100" : "opacity-75 hover:opacity-100"
        )}
        style={{ left: `${sliderPosition}%`, transform: "translateX(-50%)" }}
        aria-hidden="true"
      >
        {/* Circular drag handle */}
        <button
          type="button"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          className="absolute top-1/2 left-1/2 w-8 h-8 -ml-4 -mt-4 rounded-full bg-white shadow-lg pointer-events-auto cursor-grab active:cursor-grabbing flex items-center justify-center transition-shadow"
          style={{
            boxShadow: isDragging ? "0 0 12px rgba(255, 255, 255, 0.8)" : undefined,
          }}
          aria-label="Drag to compare original vs reframed"
          title="Drag left/right to compare"
        >
          <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 6h2v12H9V6zm4 0h2v12h-2V6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Approximate, in-browser preview of the brightness/contrast/saturation
// adjustments applied at export time. Not pixel-identical to FFmpeg's `eq`
// filter, but gives a useful directional preview.
function colorFilter(recipe?: EditRecipe): string | undefined {
  if (!recipe) return undefined;
  if (recipe.brightness === 0 && recipe.contrast === 1 && recipe.saturation === 1) {
    return undefined;
  }
  const brightness = Math.max(0, 1 + recipe.brightness);
  return `brightness(${brightness}) contrast(${recipe.contrast}) saturate(${recipe.saturation})`;
}