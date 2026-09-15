import { useEffect, useState, RefObject } from "react";
import { EditRecipe, Subtitle } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SubtitlesOverlayProps {
  recipe: EditRecipe;
  videoRef: RefObject<HTMLVideoElement | null>;
  containerWidth: number;
  containerHeight: number;
}

export default function SubtitlesOverlay({
  recipe,
  videoRef,
  containerWidth,
  containerHeight,
}: SubtitlesOverlayProps) {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [videoRef]);

  if (!recipe.subtitles || recipe.subtitles.length === 0) {
    return null;
  }

  // Find all active subtitles for current time
  const activeSubtitles = recipe.subtitles.filter(
    (sub) => currentTime >= sub.startTime && currentTime <= sub.endTime
  );

  if (activeSubtitles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {activeSubtitles.map((sub) => {
        // Calculate position
        const style: React.CSSProperties = {
          position: "absolute",
          fontSize: `${sub.fontSize}px`,
          color: sub.color,
          fontWeight: sub.fontWeight === "900" ? "900" : sub.fontWeight === "bold" ? "bold" : "normal",
          textShadow: "2px 2px 4px rgba(0,0,0,0.8), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
          textAlign: "center",
          whiteSpace: "pre-wrap",
        };

        if (sub.x === -1) {
          style.left = "50%";
          style.transform = "translateX(-50%)";
        } else {
          style.left = `${(sub.x / 100) * containerWidth}px`;
        }

        style.top = `${(sub.y / 100) * containerHeight}px`;

        return (
          <div key={sub.id} style={style} className="max-w-[90%]">
            {sub.text}
          </div>
        );
      })}
    </div>
  );
}
