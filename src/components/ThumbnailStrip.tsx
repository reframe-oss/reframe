"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";

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

    const captured: Thumbnail[] = [];

    for (let i = 0; i < times.length; i++) {
      if (abortRef.current) break;

      const time = times[i];
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          ctx.drawImage(video, 0, 0, thumbW, thumbH);
          captured.push({
            time,
            dataUrl: canvas.toDataURL("image/jpeg", 0.7),
          });
          setThumbnails([...captured]);
          setProgress(Math.round(((i + 1) / times.length) * 100));
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = time;
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
    abortRef.current = true;
  };
}, [videoSrc, duration, generateThumbnails]);

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
        <span className="strip-label">Frames</span>

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
              <div key={i} className="skeleton-thumb" />
            ))}
          </div>
        )}

        {thumbnails.length > 0 && (
          <div className="strip-inner">
            {thumbnails.map((thumb, i) => {
              const isActive = i === activeIndex;
              const inTrimRange =
                thumb.time >= trimStart &&
                thumb.time <= effectiveTrimEnd;

              return (
                <button
                  key={thumb.time}
                  className={`thumb-btn ${isActive ? "active" : ""} ${
                    !inTrimRange ? "out-of-range" : ""
                  }`}
                  onClick={() => onSeek(thumb.time)}
                >
                  <Image
                    src={thumb.dataUrl}
                    alt={`Thumbnail at ${formatTime(thumb.time)}`}
                    width={106}
                    height={60}
                    className="object-cover"
                    unoptimized
                  />

                  <span className="thumb-time">
                    {formatTime(thumb.time)}
                  </span>

                  {isActive && <span className="active-indicator" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
