"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";

interface Thumbnail {
  time: number;
  dataUrl: string;
}

interface ThumbnailStripProps {
  videoSrc: string | null;
  duration: number;
  currentTime: number;
  trimStart?: number;
  trimEnd?: number;
  onSeek: (time: number) => void;
  intervalSeconds?: number;
}

export default function ThumbnailStrip({
  videoSrc,
  duration,
  currentTime,
  trimStart = 0,
  trimEnd,
  onSeek,
  intervalSeconds = 5,
}: ThumbnailStripProps) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const offscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastRunIdRef = useRef(0);
  const objectUrlsRef = useRef<string[]>([]);

  const effectiveTrimEnd = trimEnd ?? duration;

  const revokeAllObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  const cancelThumbnailRun = useCallback(() => {
    lastRunIdRef.current += 1;
  }, []);

  const generateThumbnails = useCallback(async () => {
    if (!videoSrc || duration <= 0) return;

    const runId = ++lastRunIdRef.current;
    setIsGenerating(true);
    revokeAllObjectUrls();
    setThumbnails([]);
    setProgress(0);

    const video = document.createElement("video");
    offscreenVideoRef.current = video;

    try {
      video.src = videoSrc;
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.preload = "auto";

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Video load failed"));
        video.load();
      });

      if (lastRunIdRef.current !== runId) return;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const thumbW = 160;
      const thumbH = 90;
      canvas.width = thumbW;
      canvas.height = thumbH;

      const times: number[] = [];
      const seenTimestamps = new Set<string>();

      for (let t = 0; t <= duration; t += intervalSeconds) {
        const roundedTime = Math.min(t, duration - 0.1);
        const formatted = formatTime(roundedTime);
        
        if (!seenTimestamps.has(formatted)) {
          seenTimestamps.add(formatted);
          times.push(roundedTime);
        }
      }

      // Check if the final second boundary is missing from the timeline display
      const finalTime = duration - 0.1;
      const finalFormatted = formatTime(finalTime);
      if (!seenTimestamps.has(finalFormatted) && finalTime > (times[times.length - 1] ?? 0)) {
        times.push(finalTime);
      }

      const captured: Thumbnail[] = [];

      for (let i = 0; i < times.length; i++) {
        if (lastRunIdRef.current !== runId) break;

        const time = times[i] ?? 0;
        await new Promise<void>((resolve) => {
          const onSeeked = async () => {
            video.removeEventListener("seeked", onSeeked);

            if (lastRunIdRef.current !== runId) {
              resolve();
              return;
            }

            ctx.drawImage(video, 0, 0, thumbW, thumbH);

            try {
              const blob = await new Promise<Blob | null>((blobResolve) => {
                canvas.toBlob((b) => blobResolve(b), "image/jpeg", 0.7);
              });
              if (blob && lastRunIdRef.current === runId) {
                const url = URL.createObjectURL(blob);
                objectUrlsRef.current.push(url);
                captured.push({ time, dataUrl: url });

                if (i === times.length - 1 || captured.length % 5 === 0) {
                  setThumbnails([...captured]);
                }
              }
            } catch (err) {
              console.error("Failed to generate thumbnail blob", err);
            }

            setProgress(Math.round(((i + 1) / times.length) * 100));
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
          video.currentTime = time;
        });
      }

      if (lastRunIdRef.current === runId) {
        setIsGenerating(false);
      }
    } finally {
      video.src = "";
      if (offscreenVideoRef.current === video) {
        offscreenVideoRef.current = null;
      }
    }
  }, [videoSrc, duration, intervalSeconds, revokeAllObjectUrls]);

  useEffect(() => {
    if (videoSrc && duration > 0) {
      generateThumbnails();
    }
    return () => {
      cancelThumbnailRun();
      revokeAllObjectUrls();
    };
  }, [cancelThumbnailRun, generateThumbnails, revokeAllObjectUrls, videoSrc, duration]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const activeIndex = thumbnails.findIndex(
    (t, i) =>
      currentTime >= t.time &&
      (i === thumbnails.length - 1 || currentTime < (thumbnails[i + 1]?.time ?? Infinity))
  );

  if (!videoSrc) return null;

  return (
    <div className="thumbnail-strip-wrapper">
      <div className="strip-header">
        <span className="strip-label">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0.5" y="0.5" width="11" height="11" rx="1.5" stroke="currentColor" />
            <rect x="3" y="2.5" width="1.5" height="7" rx="0.5" fill="currentColor" />
            <rect x="7.5" y="2.5" width="1.5" height="7" rx="0.5" fill="currentColor" />
          </svg>
          Frames
        </span>
        {isGenerating && (
          <span className="strip-progress">
            <span
              className="progress-bar"
              style={{ width: `${progress}%` }}
            />
            <span className="progress-text">{progress}%</span>
          </span>
        )}
        {!isGenerating && thumbnails.length > 0 && (
          <span className="strip-meta">
            {thumbnails.length} frames · every {intervalSeconds}s
          </span>
        )}
      </div>

      <div className="strip-scroll-area" ref={stripRef}>
        {thumbnails.length === 0 && isGenerating && (
          <div className="strip-skeleton">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton-thumb" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        )}

        {thumbnails.length > 0 && (
          <div className="strip-inner">
            {thumbnails.map((thumb, i) => {
              const isActive = i === activeIndex;
              const inTrimRange =
                thumb.time >= trimStart && thumb.time <= effectiveTrimEnd;
              const isHovered = hoveredIndex === i;

              return (
                <button
                  key={thumb.time}
                  className={`thumb-btn ${isActive ? "active" : ""} ${
                    !inTrimRange ? "out-of-range" : ""
                  } ${isHovered ? "hovered" : ""}`}
                  onClick={() => onSeek(thumb.time)}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  title={`Seek to ${formatTime(thumb.time)}`}
                >
                  <Image
                    src={thumb.dataUrl}
                    alt={`Frame at ${formatTime(thumb.time)}`}
                    width={160}
                    height={90}
                    unoptimized
                    draggable={false}
                  />
                  <span className="thumb-time">{formatTime(thumb.time)}</span>
                  {isActive && <span className="active-indicator" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .thumbnail-strip-wrapper {
          width: 100%;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          font-family: 'SF Mono', 'Fira Code', monospace;
          box-shadow: var(--shadow);
        }

        .strip-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 14px;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
        }

        .strip-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .strip-progress {
          position: relative;
          flex: 1;
          height: 3px;
          background: var(--border);
          border-radius: 2px;
          overflow: hidden;
          display: flex;
          align-items: center;
        }

        .progress-bar {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          background: var(--accent);
          border-radius: 2px;
          transition: width 0.2s ease;
        }

        .progress-text {
          position: absolute;
          right: -28px;
          font-size: 9px;
          color: var(--muted);
          white-space: nowrap;
        }

        .strip-meta {
          margin-left: auto;
          font-size: 10px;
          color: var(--muted);
        }

        .strip-scroll-area {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 10px 10px 6px;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }

        .strip-scroll-area::-webkit-scrollbar {
          height: 4px;
        }

        .strip-scroll-area::-webkit-scrollbar-track {
          background: transparent;
        }

        .strip-scroll-area::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 2px;
        }

        .strip-skeleton {
          display: flex;
          gap: 6px;
        }

        .skeleton-thumb {
          width: 106px;
          height: 60px;
          border-radius: 6px;
          background: linear-gradient(90deg, var(--bg) 25%, var(--surface) 50%, var(--bg) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
          flex-shrink: 0;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .strip-inner {
          display: flex;
          gap: 6px;
          align-items: flex-end;
        }

        .thumb-btn {
          position: relative;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
          border-radius: 6px;
          overflow: hidden;
          flex-shrink: 0;
          width: 106px;
          height: 60px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          outline: 2px solid transparent;
          outline-offset: 1px;
        }

        .thumb-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          border-radius: 6px;
          filter: brightness(0.85);
          transition: filter 0.15s ease;
        }

        .thumb-btn:hover img,
        .thumb-btn.hovered img {
          filter: brightness(1.05);
        }

        .thumb-btn:hover,
        .thumb-btn.hovered {
          transform: translateY(-3px) scale(1.04);
          box-shadow: var(--shadow);
          outline-color: var(--accent);
          z-index: 2;
        }

        .thumb-btn.active {
          outline-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent), var(--shadow);
          z-index: 3;
        }

        .thumb-btn:focus-visible {
          transform: translateY(-3px) scale(1.04);
          box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent), var(--shadow);
          outline: none;
          z-index: 4;
        }

        .thumb-btn.active img {
          filter: brightness(1.1);
        }

        .thumb-btn.out-of-range img {
          filter: brightness(0.35) saturate(0.2);
        }

        .thumb-time {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 3px 4px 3px;
          background: linear-gradient(transparent, var(--bg));
          font-size: 9px;
          color: var(--muted);
          text-align: center;
          letter-spacing: 0.04em;
          pointer-events: none;
          border-radius: 0 0 6px 6px;
        }

        .thumb-btn.active .thumb-time {
          color: var(--text);
        }

        .active-indicator {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 6px var(--accent);
          animation: pulse-dot 1.5s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
