import Image from "next/image";
import { useRef, useState, useEffect } from "react";
import { OverlayPosition } from "@/lib/types";
import { ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight, Upload, Trash2, FileImage } from "lucide-react";
import Image from "next/image";
interface ImageOverlayPanelProps {
  overlayFile: File | null;
  setOverlayFile: (file: File | null) => void;
  overlayPosition: OverlayPosition;
  setOverlayPosition: (p: OverlayPosition) => void;
  overlaySize: number;
  setOverlaySize: (v: number) => void;
  overlayOpacity: number;
  setOverlayOpacity: (v: number) => void;
}

const POSITIONS: { value: OverlayPosition; icon: React.ReactNode; label: string }[] = [
  { value: "top-left",     icon: <ArrowUpLeft size={11} />,  label: "TL" },
  { value: "top-right",    icon: <ArrowUpRight size={11} />, label: "TR" },
  { value: "bottom-left",  icon: <ArrowDownLeft size={11} />, label: "BL" },
  { value: "bottom-right", icon: <ArrowDownRight size={11} />, label: "BR" },
];

export default function ImageOverlayPanel({
  overlayFile,
  setOverlayFile,
  overlayPosition,
  setOverlayPosition,
  overlaySize,
  setOverlaySize,
  overlayOpacity,
  setOverlayOpacity,
}: ImageOverlayPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string>("");

  useEffect(() => {
    if (!overlayFile) {
      setThumbUrl("");
      return;
    }
    const url = URL.createObjectURL(overlayFile);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [overlayFile]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setOverlayFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const isSmallSize = overlaySize <= 150;
  const isMediumSize = overlaySize > 150 && overlaySize <= 300;
  const isLargeSize = overlaySize > 300;

  const isFaintOpacity = overlayOpacity <= 35;
  const isMediumOpacity = overlayOpacity > 35 && overlayOpacity <= 75;
  const isSolidOpacity = overlayOpacity > 75;

  return (
    <div className="w-full text-[11px] text-[var(--text)] space-y-3">
      
      {/* Side-by-Side Area */}
      <div className="flex gap-2.5 items-center w-full">
        
        {/* Left Side: Dynamic Upload / Preview Square */}
        <label htmlFor="overlay-file-input" className={`w-14 h-11 shrink-0 rounded-lg overflow-hidden flex flex-col items-center justify-center transition border ${
          overlayFile 
            ? "border-[var(--border)] bg-[var(--bg)] pointer-events-none"
            : "border-dashed border-[var(--border)] hover:bg-[var(--accent-muted)] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
        }`}>
          {thumbUrl ? (
            <div className="relative w-full h-full">
  <Image
    src={thumbUrl}
    alt="Overlay preview"
    fill
    className="object-cover"
  />
</div>
          ) : (
            <>
              <Upload size={14} className="opacity-80" />
              <span className="text-[9px] mt-0.5 font-medium tracking-wide">Upload</span>
            </>
          )}
          <input
            id="overlay-file-input"
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleUpload}
            className="hidden"
            disabled={!!overlayFile}
            aria-label="Upload overlay image"
          />
        </label>

        {/* Right Side: Horizontal Details Card */}
        <div className="flex-1 min-w-0 h-11 rounded-lg border border-[var(--border)] bg-[var(--bg)] flex items-center justify-between px-3 gap-2.5">
          {overlayFile ? (
            <>
              {/* File Info block */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileImage size={14} className="text-[var(--muted)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-[var(--text)] truncate">
                    {overlayFile.name}
                  </p>
                  <p className="text-[9px] text-[var(--muted)] mt-0.5">
                    {(overlayFile.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOverlayFile(null)}
                aria-label="Remove overlay image"
                className="w-6 h-6 rounded flex items-center justify-center bg-[var(--error-bg)] hover:bg-[var(--error-hover)] text-[var(--error)] border border-[var(--error-border)] transition shrink-0"
              >
                <Trash2 size={11} aria-hidden="true" />
              </button>
            </>
          ) : (
            <span className="text-[10px] text-[var(--muted)] italic">
              No asset selected
            </span>
          )}
        </div>
      </div>

      {/* Control Presets Configuration Dashboard */}
      {overlayFile && (
        <div className="space-y-1.5 pt-1 animate-fade-in">
          {/* Position Selector Row */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--muted)] w-8">Pos:</span>
            <div className="grid grid-cols-4 gap-1 flex-1">
              {POSITIONS.map(({ value, icon, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOverlayPosition(value)}
                  className={`rounded border py-0.5 text-center text-[10px] transition flex items-center justify-center gap-0.5 ${
                    overlayPosition === value
                      ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent-muted)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--accent-muted)]"
                  }`}
                >
                  <span className={overlayPosition === value ? "text-[var(--accent)]" : "text-[var(--muted)]"}>
                    {icon}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Size Preset Row */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--muted)] w-8">Size:</span>
            <div className="grid grid-cols-3 gap-1 flex-1">
              <button
                type="button"
                onClick={() => setOverlaySize(100)}
                className={`rounded border py-0.5 text-center text-[10px] transition ${
                  isSmallSize
                    ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent-muted)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--accent-muted)]"
                }`}
              >
                Small
              </button>
              <button
                type="button"
                onClick={() => setOverlaySize(250)}
                className={`rounded border py-0.5 text-center text-[10px] transition ${
                  isMediumSize
                    ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent-muted)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--accent-muted)]"
                }`}
              >
                Medium
              </button>
              <button
                type="button"
                onClick={() => setOverlaySize(450)}
                className={`rounded border py-0.5 text-center text-[10px] transition ${
                  isLargeSize
                    ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent-muted)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--accent-muted)]"
                }`}
              >
                Large
              </button>
            </div>
          </div>

          {/* Opacity Preset Row */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--muted)] w-8">Opa:</span>
            <div className="grid grid-cols-3 gap-1 flex-1">
              <button
                type="button"
                onClick={() => setOverlayOpacity(25)}
                className={`rounded border py-0.5 text-center text-[10px] transition ${
                  isFaintOpacity
                    ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent-muted)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--accent-muted)]"
                }`}
              >
                25%
              </button>
              <button
                type="button"
                onClick={() => setOverlayOpacity(60)}
                className={`rounded border py-0.5 text-center text-[10px] transition ${
                  isMediumOpacity
                    ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent-muted)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--accent-muted)]"
                }`}
              >
                60%
              </button>
              <button
                type="button"
                onClick={() => setOverlayOpacity(100)}
                className={`rounded border py-0.5 text-center text-[10px] transition ${
                  isSolidOpacity
                    ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent-muted)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--accent-muted)]"
                }`}
              >
                100%
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
