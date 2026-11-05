"use client";

import { EditRecipe, type OutputFormat } from "@/lib/types";
import { Film } from "lucide-react";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
}

const FORMAT_OPTIONS = [
  { id: "mp4", label: "MP4", description: "Best compatibility, smaller file size" },
  { id: "webm", label: "WebM", description: "Open format, optimized for web" },
  { id: "mkv", label: "MKV", description: "Container, maximum quality" },
  { id: "gif", label: "GIF", description: "Animated image — keep clips under 10 s" },
  { id: "mp3", label: "MP3", description: "Sound only, compressed — plays everywhere" },
  { id: "wav", label: "WAV", description: "Sound only, uncompressed — for further editing" },
] as const satisfies readonly { id: OutputFormat; label: string; description: string }[];

export default function FormatSelector({ recipe, onChange }: Props) {
  return (
    <div>
      <div id="format-label" className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Film size={15} aria-hidden="true" className="text-[var(--muted)]" />
        Format
      </div>
      <div role="group" aria-labelledby="format-label" className="grid grid-cols-3 gap-1.5">
        {FORMAT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange({ format: option.id })}
            aria-pressed={recipe.format === option.id}
            className="choice min-h-[36px] px-2 text-xs font-medium"
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="hint mt-2">
        {FORMAT_OPTIONS.find((o) => o.id === recipe.format)?.description}
      </p>
    </div>
  );
}