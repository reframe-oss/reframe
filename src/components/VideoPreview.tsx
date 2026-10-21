/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */
"use client";

import { useEffect, useRef, useState, useCallback, RefObject } from "react";
import { EditRecipe, TextOverlay, TimelineTrack, MultiTrackEditorState } from "@/lib/types";
import { getPresetById } from "@/lib/presets";
import { cn } from "@/lib/utils";
import { Camera, Columns2, Grid3x3, Frame } from "lucide-react";
import ComparisonPreview from "./ComparisonPreview";
import DraggableTextOverlays from "./DraggableTextOverlays";

interface Props {
  file: File | null;
  recipe?: EditRecipe;
  videoRef: RefObject<HTMLVideoElement | null>;
  selectedTextId?: string | null;
  onSelectText?: (id: string | null) => void;
  onUpdateText?: (id: string, updates: Partial<TextOverlay>) => void;
  // Phase 1 MVP: Multi-track support
  multiTrackState?: MultiTrackEditorState | null;
  multiTrackVideoRefs?: Record<string, RefObject<HTMLVideoElement | null>>;
}

export default function VideoPreview({
  file,
  recipe,
  videoRef,
  selectedTextId = null,
  onSelectText,
  onUpdateText,
  multiTrackState,
  multiTrackVideoRefs,
}: Props) {
  const lastId = useRef(0);
  const urlRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showGridOverlay, setShowGridOverlay] = useState(false);
  const [containerDimensions, setContainerDimensions] = useState({
    width: 0,
    height: 0,
  });
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const onLoadedRef = useRef<(() => void) | null>(null);
  
  // Phase 1 MVP: Multi-track URL management
  const multiTrackUrlRefs = useRef<Record<string, string | null>>({});

  const handleGrabFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;

      const totalSec = Math.floor(video.currentTime);
      const mins = String(Math.floor(totalSec / 60)).padStart(2, "0");
      const secs = String(totalSec % 60).padStart(2, "0");
      const filename = `frame-${mins}m${secs}s.png`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [videoRef]);

  useEffect(() => {
    if (!file) return;

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    // Part of the same object-URL/video-element imperative lifecycle below
    // (video.src, video.load()), not a derivable value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    const id = ++lastId.current;
    const url = URL.createObjectURL(file);

    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }
    urlRef.current = url;

    const video = videoRef.current;
    if (!video) return;

    video.src = url;
    video.load();

    const handleLoaded = () => {
      if (lastId.current !== id) return;
      video.play().catch(() => {});
    };

    onLoadedRef.current = handleLoaded;

    video.addEventListener("loadeddata", handleLoaded);

    return () => {
      if (onLoadedRef.current) {
        video.removeEventListener("loadeddata", onLoadedRef.current);
        onLoadedRef.current = null;
      }

      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }

      if (urlRef.current === url) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [file, videoRef]);

  // Phase 1 MVP: Setup multi-track video sources
  useEffect(() => {
    if (!multiTrackState || !multiTrackVideoRefs) return;

    multiTrackState.timelineTracks.forEach((track) => {
      if (track.type !== "video" || !track.source) return;

      const videoRef = multiTrackVideoRefs[track.id];
      if (!videoRef?.current) return;

      // Cleanup old URL
      if (multiTrackUrlRefs.current[track.id]) {
        URL.revokeObjectURL(multiTrackUrlRefs.current[track.id]!);
      }

      // Create new URL and load
      const url = URL.createObjectURL(track.source);
      multiTrackUrlRefs.current[track.id] = url;
      videoRef.current.src = url;
      videoRef.current.load();

      // Auto-play for preview
      videoRef.current.play().catch(() => {});
    });

    return () => {
      // Cleanup URLs on unmount
      Object.values(multiTrackUrlRefs.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      multiTrackUrlRefs.current = {};
    };
  }, [multiTrackState, multiTrackVideoRefs]);

  // Narrow dependencies: these used to re-run on every recipe change (every
  // slider tick), re-assigning the same values on the media element.
  const keepAudio = recipe?.keepAudio;
  const speed = recipe?.speed;
  useEffect(() => {
    if (!videoRef.current || keepAudio === undefined) return;
    videoRef.current.muted = !keepAudio;
  }, [keepAudio, videoRef]);

  useEffect(() => {
    if (!videoRef.current || speed === undefined) return;
    videoRef.current.playbackRate = speed;
  }, [speed, videoRef]);

  /**
   * Track preview container dimensions for text overlay positioning.
   * ResizeObserver also catches layout-driven size changes (sidebar, panel
   * expansion) that a window `resize` listener missed, and the guard skips
   * re-renders when the size hasn't meaningfully changed.
   */
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;

    let last = { width: -1, height: -1 };
    const update = (width: number, height: number) => {
      if (Math.abs(last.width - width) < 1 && Math.abs(last.height - height) < 1) return;
      last = { width, height };
      setContainerDimensions(last);
    };

    const rect = el.getBoundingClientRect();
    update(rect.width, rect.height);

    if (typeof ResizeObserver === "undefined") {
      const onResize = () => {
        const r = el.getBoundingClientRect();
        update(r.width, r.height);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) update(box.width, box.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [file]);

  const overlay = (() => {
    if (!recipe || !showOverlay) return null;

    const preset = recipe.preset === "custom"
      ? { width: recipe.customWidth, height: recipe.customHeight }
      : getPresetById(recipe.preset);

    if (!preset) return null;

    // Preview container is 16:9
    const containerW = 16;
    const containerH = 9;
    const containerRatio = containerW / containerH;   // 1.777…
    const outputRatio = preset.width / preset.height;

    if (recipe.framing === "fit") {
      // Letterbox: the output video fits entirely inside 16:9, padded with bars.
      if (outputRatio > containerRatio) {
        // Wider output → pillarbox bars on top & bottom
        const contentH = (containerRatio / outputRatio) * 100;
        const barH = (100 - contentH) / 2;
        return { mode: "fit", barTop: `${barH}%`, barBottom: `${barH}%`, barLeft: "0", barRight: "0" };
      } else {
        // Taller output → letterbox bars on left & right
        const contentW = (outputRatio / containerRatio) * 100;
        const barW = (100 - contentW) / 2;
        return { mode: "fit", barTop: "0", barBottom: "0", barLeft: `${barW}%`, barRight: `${barW}%` };
      }
    } else {
      // Fill / crop: the output fills the entire 16:9 preview — show a box representing what survives the crop.
      if (outputRatio < containerRatio) {
        // Output is taller → crops top & bottom
        const visibleH = (outputRatio / containerRatio) * 100;
        const cropH = (100 - visibleH) / 2;
        return { mode: "fill", barTop: `${cropH}%`, barBottom: `${cropH}%`, barLeft: "0", barRight: "0" };
      } else {
        // Output is wider → crops left & right
        const visibleW = (containerRatio / outputRatio) * 100;
        const cropW = (100 - visibleW) / 2;
        return { mode: "fill", barTop: "0", barBottom: "0", barLeft: `${cropW}%`, barRight: `${cropW}%` };
      }
    }
  })();

  if (!file) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.code === "Space") {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const video = videoRef.current;
      if (video) {
        e.preventDefault(); // Prevent default page scroll
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    }
  };

  const toolButton = (pressed: boolean) =>
    cn("btn btn-ghost btn-sm", pressed && "bg-[var(--accent-muted)] text-[var(--text)]");

  return (
    <>
      <div
        ref={previewContainerRef}
        role="group"
        className="relative w-full overflow-hidden rounded-[10px] bg-[var(--viewer)] aspect-video"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Video preview (press Space to play/pause)"
      >
        {isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs text-white/60"
            role="status"
          >
            Loading preview…
          </div>
        )}
        {/* The video itself is never transitioned or animated. */}
        <video
          ref={videoRef}
          controls
          className={cn("w-full h-full object-contain", isLoading && "invisible")}
          style={{
            filter: recipe
              ? `brightness(${1 + (recipe.brightness ?? 0)}) contrast(${recipe.contrast ?? 1}) saturate(${recipe.saturation ?? 1})`
              : undefined,
          }}
          onLoadedData={() => setIsLoading(false)}
          playsInline
          muted={!recipe?.keepAudio}
        >
          <track kind="captions" />
        </video>

        {/* Phase 1 MVP: Multi-track overlay rendering */}
        {multiTrackState && multiTrackVideoRefs && multiTrackState.timelineTracks.length > 1 && (
          <div className="absolute inset-0 pointer-events-none" role="region" aria-label="Multi-track overlay layers">
            {multiTrackState.timelineTracks
              .filter((track) => track.visible && track.type === "video" && track.source && track.zIndex > 0)
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((track) => {
                const videoRef = multiTrackVideoRefs[track.id];
                if (!videoRef) return null;

                return (
                  <video
                    key={track.id}
                    ref={videoRef}
                    className="absolute"
                    style={{
                      left: track.position.x === -1 ? "50%" : `${track.position.x}px`,
                      top: track.position.y === -1 ? "50%" : `${track.position.y}px`,
                      width: `${track.scale * 100}%`,
                      height: "auto",
                      opacity: track.opacity / 100,
                      transform:
                        track.position.x === -1 && track.position.y === -1
                          ? "translate(-50%, -50%)"
                          : "none",
                      zIndex: track.zIndex,
                    }}
                    muted
                    playsInline
                  >
                    <track kind="captions" />
                  </video>
                );
              })}
          </div>
        )}

        {/* Letterbox / Crop overlay */}
        {overlay && (
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {overlay.mode === "fit" ? (
              // Letterbox: the bars the output will add
              <>
                <div className="absolute left-0 right-0 top-0 bg-black/70" style={{ height: overlay.barTop }} />
                <div className="absolute left-0 right-0 bottom-0 bg-black/70" style={{ height: overlay.barBottom }} />
                <div className="absolute top-0 bottom-0 left-0 bg-black/70" style={{ width: overlay.barLeft }} />
                <div className="absolute top-0 bottom-0 right-0 bg-black/70" style={{ width: overlay.barRight }} />
              </>
            ) : (
              // Fill/crop: dim what will be cropped, outline what survives
              <>
                <div className="absolute left-0 right-0 top-0 bg-black/60" style={{ height: overlay.barTop }} />
                <div className="absolute left-0 right-0 bottom-0 bg-black/60" style={{ height: overlay.barBottom }} />
                <div className="absolute top-0 bottom-0 left-0 bg-black/60" style={{ width: overlay.barLeft }} />
                <div className="absolute top-0 bottom-0 right-0 bg-black/60" style={{ width: overlay.barRight }} />
                <div
                  className="absolute border border-dashed border-white/80"
                  style={{
                    top: overlay.barTop,
                    bottom: overlay.barBottom,
                    left: overlay.barLeft,
                    right: overlay.barRight,
                  }}
                />
              </>
            )}
          </div>
        )}

        {/* 3x3 Grid Overlay */}
        {showGridOverlay && (
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 bottom-0 left-1/3 border-l border-white/40" />
            <div className="absolute top-0 bottom-0 right-1/3 border-l border-white/40" />
            <div className="absolute left-0 right-0 top-1/3 border-t border-white/40" />
            <div className="absolute left-0 right-0 bottom-1/3 border-t border-white/40" />
          </div>
        )}

        {/* Draggable Text Overlays */}
        {recipe && !isLoading && containerDimensions.width > 0 && (
          <DraggableTextOverlays
            recipe={recipe}
            containerWidth={containerDimensions.width}
            containerHeight={containerDimensions.height}
            selectedTextId={selectedTextId ?? null}
            onSelectText={onSelectText || (() => {})}
            onUpdateText={onUpdateText || (() => {})}
          />
        )}
      </div>

      {/* Viewer toolbar: below the picture so controls never cover the video. */}
      {!isLoading && (
        <div role="toolbar" aria-label="Preview tools" className="mt-2 flex flex-wrap items-center gap-1">
          {recipe && (
            <>
              <button
                type="button"
                onClick={() => setShowOverlay((v) => !v)}
                className={toolButton(showOverlay)}
                aria-pressed={showOverlay}
                title="Show how the output frame crops or letterboxes the video"
              >
                <Frame size={14} aria-hidden="true" />
                Framing guide
              </button>
              <button
                type="button"
                onClick={() => setShowGridOverlay((v) => !v)}
                className={toolButton(showGridOverlay)}
                aria-pressed={showGridOverlay}
                title="Rule-of-thirds grid"
              >
                <Grid3x3 size={14} aria-hidden="true" />
                Grid
              </button>
              <button
                type="button"
                onClick={() => setShowComparison((v) => !v)}
                className={toolButton(showComparison)}
                aria-pressed={showComparison}
                title="Compare the original with your adjustments side by side"
              >
                <Columns2 size={14} aria-hidden="true" />
                Compare
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleGrabFrame}
            className="btn btn-ghost btn-sm ml-auto"
            title="Download the current frame as a PNG"
          >
            <Camera size={14} aria-hidden="true" />
            Save frame
          </button>
        </div>
      )}

      {showComparison && file && (
        <div className="mt-4">
          <ComparisonPreview file={file} recipe={recipe} videoRef={videoRef} />
        </div>
      )}
    </>
  );
}