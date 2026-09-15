/* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */
"use client";

import { useEffect, useRef, useState, useCallback, RefObject } from "react";
import { EditRecipe, TextOverlay, TimelineTrack, MultiTrackEditorState } from "@/lib/types";
import { getPresetById } from "@/lib/presets";
import { cn } from "@/lib/utils";
import { Camera } from "lucide-react";
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
 
export interface VideoPreviewProps {
  /** URL / object-URL of the video to preview */
  src: string;
  /** Current colour adjustments from the editor */
  adjustments?: ColourAdjustments;
  /** Optional: max width of the preview in px (default: 854) */
  maxWidth?: number;
}
 
// ── Helpers ──────────────────────────────────────────────────────────────────
 
const DEFAULT: ColourAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
};
 
function buildFilterString(adj: ColourAdjustments): string {
  const parts: string[] = [];
  if (adj.brightness !== DEFAULT.brightness)
    parts.push(`brightness(${adj.brightness}%)`);
  if (adj.contrast !== DEFAULT.contrast)
    parts.push(`contrast(${adj.contrast}%)`);
  if (adj.saturation !== DEFAULT.saturation)
    parts.push(`saturate(${adj.saturation}%)`);
  return parts.join(" ");
}
 
function isAdjusted(adj: ColourAdjustments): boolean {
  return (
    adj.brightness !== DEFAULT.brightness ||
    adj.contrast !== DEFAULT.contrast ||
    adj.saturation !== DEFAULT.saturation
  );
}
 
// ── Component ────────────────────────────────────────────────────────────────
 
export default function VideoPreview({
  src,
  adjustments = DEFAULT,
  maxWidth = 854,
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: maxWidth, height: 480 });
 
  const filterString = useMemo(
    () => buildFilterString(adjustments),
    [adjustments]
  );
  const showSlider = isAdjusted(adjustments);
 
  // Derive pixel dimensions once video metadata loads

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
    setIsLoading(true);
    const id = ++lastId.current;
    const url = URL.createObjectURL(file);

    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }
    urlRef.current = url;

    const video = videoRef.current;
    if (!video) return;
 
    const onMeta = () => {
      const aspect = video.videoWidth / (video.videoHeight || 1);
      const w = Math.min(maxWidth, video.videoWidth || maxWidth);
      const h = Math.round(w / aspect);
      setDimensions({ width: w, height: h });
    };
 
    video.addEventListener("loadedmetadata", onMeta);
    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, [src, maxWidth]);
 
  const { width, height } = dimensions;
 

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

  useEffect(() => {
    if (!videoRef.current || !recipe) return;
    videoRef.current.muted = !recipe.keepAudio;
  }, [recipe, videoRef]);

  useEffect(() => {
    if (!videoRef.current || !recipe) return;
    videoRef.current.playbackRate = recipe.speed;
  }, [recipe, videoRef]);

  /**
   * Track preview container dimensions for text overlay positioning.
   */
  useEffect(() => {
    const updateDimensions = () => {
      if (previewContainerRef.current) {
        const rect = previewContainerRef.current.getBoundingClientRect();
        setContainerDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

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

  return (
    <>
      <div
        ref={previewContainerRef}
        role="group"
        className="relative w-full rounded-lg overflow-hidden bg-[var(--bg)] aspect-video focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Video preview (press Space to play/pause)"
      >
        {isLoading && (
          <div
            className="absolute inset-0 animate-pulse bg-[var(--surface)] rounded-xl transition-opacity duration-300"
            aria-label="Loading video preview"
          />
        )}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          controls
          className={cn("w-full h-full object-contain transition-opacity duration-300", isLoading ? "opacity-0" : "opacity-100")}
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
              // Letterbox: semi-transparent bars outside the content area
              <>
                <div className="absolute left-0 right-0 top-0 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]" style={{ height: overlay.barTop }} />
                <div className="absolute left-0 right-0 bottom-0 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]" style={{ height: overlay.barBottom }} />
                <div className="absolute top-0 bottom-0 left-0 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]" style={{ width: overlay.barLeft }} />
                <div className="absolute top-0 bottom-0 right-0 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]" style={{ width: overlay.barRight }} />
              </>
            ) : (
              // Fill/crop: dashed border around the surviving area, dimmed outside
              <>
                <div className="absolute left-0 right-0 top-0 bg-[var(--error-bg)]" style={{ height: overlay.barTop }} />
                <div className="absolute left-0 right-0 bottom-0 bg-[var(--error-bg)]" style={{ height: overlay.barBottom }} />
                <div className="absolute top-0 bottom-0 left-0 bg-[var(--error-bg)]" style={{ width: overlay.barLeft }} />
                <div className="absolute top-0 bottom-0 right-0 bg-[var(--error-bg)]" style={{ width: overlay.barRight }} />
                <div
                  className="absolute border-2 border-dashed border-film-400"
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
            {/* Vertical lines */}
            <div className="absolute top-0 bottom-0 left-1/3 border-l-2 border-dotted border-black" />
            <div className="absolute top-0 bottom-0 right-1/3 border-l-2 border-dotted border-black" />
            {/* Horizontal lines */}
            <div className="absolute left-0 right-0 top-1/3 border-t-2 border-dotted border-black" />
            <div className="absolute left-0 right-0 bottom-1/3 border-t-2 border-dotted border-black" />
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

        {/* Toggle button */}
        {recipe && !isLoading && (
          <button
            type="button"
            onClick={() => setShowOverlay((v) => !v)}
            className={`absolute top-2 left-2 px-2 py-1 text-[10px] font-heading font-bold uppercase tracking-wider rounded transition-colors z-10 pointer-events-auto ${
              showOverlay
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--accent-muted)] hover:text-[var(--text)]"
            }`}
            aria-pressed={showOverlay}
            aria-label={showOverlay ? "Hide framing overlay" : "Show framing overlay"}
            title={showOverlay ? "Hide framing overlay" : "Show framing overlay"}
          >
            {showOverlay ? "Hide overlay" : "Show overlay"}
          </button>
        )}

        {/* Grid overlay button */}
        {recipe && !isLoading && (
          <button
            type="button"
            onClick={() => setShowGridOverlay((v) => !v)}
            className={`absolute top-2 left-32 px-2 py-1 text-[10px] font-heading font-bold uppercase tracking-wider rounded transition-colors z-10 pointer-events-auto ${
              showGridOverlay
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--accent-muted)] hover:text-[var(--text)]"
            }`}
            aria-pressed={showGridOverlay}
            aria-label={showGridOverlay ? "Hide grid overlay" : "Show grid overlay"}
            title={showGridOverlay ? "Hide grid overlay" : "Show grid overlay"}
          >
            {showGridOverlay ? "Hide grid" : "Show grid"}
          </button>
        )}

        {/* Compare button */}
        {recipe && !isLoading && (
          <button
            type="button"
            onClick={() => setShowComparison((v) => !v)}
            className={`absolute top-2 right-32 px-2 py-1 text-[10px] font-heading font-bold uppercase tracking-wider rounded transition-colors z-10 pointer-events-auto ${
              showComparison
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--accent-muted)] hover:text-[var(--text)]"
            }`}
            aria-pressed={showComparison}
            aria-label={showComparison ? "Hide comparison preview" : "Show comparison preview"}
            title={showComparison ? "Hide comparison preview" : "Show comparison preview"}
          >
            Compare
          </button>
        )}

        {/* Grab frame button */}
        {!isLoading && (
          <button
            type="button"
            onClick={handleGrabFrame}
            className="absolute top-2 right-2 px-2 py-1 text-[10px] font-heading font-bold uppercase tracking-wider rounded transition-colors z-10 pointer-events-auto bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--accent-muted)] hover:text-[var(--text)] flex items-center gap-1"
            aria-label="Grab frame as PNG"
            title="Download current frame as PNG"
          >
            <Camera className="w-3 h-3" />
            Grab frame
          </button>
        )}
      </div>

      {showComparison && file && (
        <div className="mt-4">
          <ComparisonPreview file={file} recipe={recipe} videoRef={videoRef} />
        </div>
      )}
    </>
  );
}