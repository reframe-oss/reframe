import { EditRecipe, Subtitle } from "@/lib/types";
import { useSubtitles } from "@/hooks/useSubtitles";
import { Wand2, X, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubtitlesControlProps {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
  file: File | null;
  duration: number;
}

export default function SubtitlesControl({ recipe, onChange, file, duration }: SubtitlesControlProps) {
  const { isGenerating, progressText, progressPercent, error, generateSubtitles, cancelGeneration } = useSubtitles();

  const handleGenerate = () => {
    if (!file) return;
    generateSubtitles(file, (newSubtitles) => {
      // Append or replace? Let's replace for now, or append if user wants to.
      // Auto generator should probably replace to avoid duplicates if they run it twice.
      onChange({ subtitles: newSubtitles });
    });
  };

  const updateSubtitle = (id: string, patch: Partial<Subtitle>) => {
    onChange({
      subtitles: recipe.subtitles.map(s => s.id === id ? { ...s, ...patch } : s)
    });
  };

  const removeSubtitle = (id: string) => {
    onChange({
      subtitles: recipe.subtitles.filter(s => s.id !== id)
    });
  };

  const addSubtitle = () => {
    const newSub: Subtitle = {
      id: `sub-${Date.now()}`,
      text: "New subtitle",
      startTime: 0,
      endTime: 2,
      x: -1,
      y: 90,
      fontSize: 48,
      color: "#ffffff",
      fontWeight: "bold",
    };
    onChange({ subtitles: [...(recipe.subtitles || []), newSub] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={isGenerating ? cancelGeneration : handleGenerate}
          disabled={!file}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-colors",
            isGenerating
              ? "bg-[var(--error-bg)] text-[var(--error)] border border-[var(--error-border)] hover:bg-[var(--error-hover)]"
              : "bg-film-100 text-film-700 border border-film-200 hover:bg-film-200"
          )}
        >
          {isGenerating ? <X size={16} /> : <Wand2 size={16} />}
          {isGenerating ? "Cancel Generation" : "Auto Generate AI Subtitles"}
        </button>
      </div>

      {isGenerating && (
        <div className="space-y-2 bg-[var(--bg)] p-3 rounded-lg border border-[var(--border)]">
          <div className="flex justify-between text-xs text-[var(--muted)]">
            <span>{progressText}</span>
            {progressPercent > 0 && <span>{Math.round(progressPercent)}%</span>}
          </div>
          {progressPercent > 0 && (
            <div className="h-1.5 w-full bg-[var(--border)] rounded-full overflow-hidden">
              <div 
                className="h-full bg-film-500 transition-all duration-300" 
                style={{ width: `${progressPercent}%` }} 
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-xs text-[var(--error)] bg-[var(--error-bg)] p-2 rounded border border-[var(--error-border)]">
          {error}
        </div>
      )}

      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
        {recipe.subtitles?.map((sub, index) => (
          <div key={sub.id} className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg space-y-2 relative group">
            <button
              onClick={() => removeSubtitle(sub.id)}
              className="absolute top-2 right-2 p-1 text-[var(--muted)] hover:text-[var(--error)] opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove subtitle"
            >
              <X size={14} />
            </button>
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="font-mono bg-[var(--border)] px-1 rounded">{index + 1}</span>
              <Clock size={12} />
              <input
                type="number"
                step="0.1"
                min="0"
                max={duration}
                value={sub.startTime.toFixed(1)}
                onChange={(e) => updateSubtitle(sub.id, { startTime: parseFloat(e.target.value) || 0 })}
                className="w-14 bg-transparent border-b border-transparent hover:border-[var(--border)] focus:border-film-500 outline-none px-1"
              />
              <span>to</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max={duration}
                value={sub.endTime.toFixed(1)}
                onChange={(e) => updateSubtitle(sub.id, { endTime: parseFloat(e.target.value) || 0 })}
                className="w-14 bg-transparent border-b border-transparent hover:border-[var(--border)] focus:border-film-500 outline-none px-1"
              />
            </div>
            <textarea
              value={sub.text}
              onChange={(e) => updateSubtitle(sub.id, { text: e.target.value })}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded p-2 text-sm text-[var(--text)] focus:border-film-500 outline-none resize-none"
              rows={2}
            />
          </div>
        ))}
        {recipe.subtitles?.length === 0 && !isGenerating && (
          <div className="text-center text-xs text-[var(--muted)] py-4">
            No subtitles yet. Click above to generate or add manually.
          </div>
        )}
      </div>
      
      <button
        onClick={addSubtitle}
        className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--text)] transition-colors"
      >
        <Plus size={14} />
        Add Manual Subtitle
      </button>
    </div>
  );
}
