"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useVideoEditor } from "@/hooks/useVideoEditor";
import { TextOverlay } from "@/lib/types";
import FileUpload from "./FileUpload";
import PrivacyBanner from "./PrivacyBanner";
import VideoPreview from "./VideoPreview";
import ThumbnailStrip from "./ThumbnailStrip";
import PresetSelector from "./PresetSelector";
import FramingControl from "./FramingControl";
import TrimControl from "./TrimControl";
import RotateControl from "./RotateControl";
import TextControls from "./TextControls";
import AudioSpeedControl from "./AudioSpeedControl";
import FormatSelector from "./FormatSelector";
import ExportSettings from "./ExportSettings";
import ExportOverlay from "./ExportOverlay";
import DownloadResult from "./DownloadResult";
import ImageOverlay from "./ImageOverlay"
import { getPresetById } from "@/lib/presets";

import { cn } from "@/lib/utils";
import {
  Layers, Crop, Scissors, RotateCw, Volume2, Type,
  SlidersHorizontal, Zap, AlertTriangle, Github, Copy
} from "lucide-react";
import OnboardingTour from "./OnboardingTour";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { loadOverlayState, persistOverlayState } from "@/lib/editorPersistence";

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  delay?: number;
}

function Section({ icon, title, children, delay = 0 }: SectionProps) {
  return (
    <div
      className="space-y-3 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-film-500 opacity-80">{icon}</span>
        <h3 className="text-sm font-heading font-bold uppercase tracking-widest text-[var(--muted)]">
          {title}
        </h3>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>
      {children}
    </div>
  );
}

/** Accordion section with collapsible content. */
function AccordionSection({
  id,
  icon,
  title,
  children,
  isOpen,
  onToggle,
  delay = 0,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  delay?: number;
}) {
  return (
    <div className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--border)] transition-all duration-200 group rounded-lg"
      >
        <div className="flex items-center gap-2">
          <span className="text-film-500 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform duration-200">{icon}</span>
          <span className="text-sm font-heading font-bold uppercase tracking-widest text-[var(--muted)]">{title}</span>
        </div>
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={cn("text-[var(--muted)] transition-transform duration-200", isOpen && "rotate-180")}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        id={`${id}-panel`}
        className={cn(
          "transition-all duration-200",
          isOpen ? "block" : "hidden"
        )}
      >
        <div className="px-3 pt-3 pb-0">{children}</div>
      </div>
    </div>
  );
}

/** Inline keyboard hint badge. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[10px] font-mono text-[var(--muted)] leading-none">
      {children}
    </kbd>
  );
}

/** Collapsible panel that lists all keyboard shortcuts. */
function KeyboardShortcutsPanel() {
  const [open, setOpen] = useState(false);

  const shortcuts: { keys: React.ReactNode[]; label: string }[] = [
  {
    keys: [
      <Kbd key="ctrl">Ctrl</Kbd>,
      <span key="plus1" className="text-[var(--muted)] text-xs">+</span>,
      <Kbd key="shift">Shift</Kbd>,
      <span key="plus2" className="text-[var(--muted)] text-xs">+</span>,
      <Kbd key="e">E</Kbd>
    ],
    label: "Export video",
  },
  {
    keys: [<Kbd key="m">M</Kbd>],
    label: "Toggle audio mute",
  },
  {
    keys: [<Kbd key="r">R</Kbd>],
    label: "Reset all settings",
  },
  {
    keys: [<Kbd key="esc">Esc</Kbd>],
    label: "Cancel export",
  },
  {
    keys: [<Kbd key="1">1</Kbd>, <span key="dash" className="text-[var(--muted)] text-xs">–</span>, <Kbd key="9">9</Kbd>],
    label: "Switch preset by index",
  },
  {
    keys: [<Kbd key="question">?</Kbd>],
    label: "Toggle this panel",
  },
  {
    keys: [<Kbd key="i">I</Kbd>],
    label: "Set trim in point",
  },
  {
    keys: [<Kbd key="o">O</Kbd>],
    label: "Set trim out point",
  },
];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] animate-fade-in overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="keyboard-shortcuts-list"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--border)] transition-colors duration-150"
      >
        <span className="text-[10px] font-heading font-bold uppercase tracking-widest text-[var(--muted)] flex items-center gap-2">
          <Kbd>⌨</Kbd>
          Keyboard Shortcuts
        </span>
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={cn("text-[var(--muted)] transition-transform duration-200", open && "rotate-180")}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          id="keyboard-shortcuts-list"
          className="px-4 pb-3 space-y-2 border-t border-[var(--border)]"
        >
          {shortcuts.map(({ keys, label }) => (
            <li key={label} className="flex items-center justify-between gap-3 pt-2">
              <span className="text-xs text-[var(--muted)]">{label}</span>
              <span className="flex items-center gap-1 shrink-0">{keys}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function VideoEditor() {
  const {
    file, duration, recipe, status, progress,
    result, error, exportStartedAt, updateRecipe,
    handleFileSelect, fileError, handleExport, cancelExport, reset, resetSettings,
    videoRef,
    seekTo,
    overlayFile, setOverlayFile,
    overlayPosition, setOverlayPosition,
    overlaySize, setOverlaySize,
    overlayOpacity, setOverlayOpacity,
    recommendedPreset,
    currentTime,
    toggleSound,
  } = useVideoEditor();

  useKeyboardShortcuts({
    file,
    recipe,
    resetSettings,
    updateRecipe,
    handleExport,
    status,
    cancelExport,
    onToggleShortcutsModal: () => {},
    currentTime,
    duration,
  });

  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const initialOverlayState = useRef({
    overlayPosition,
    overlaySize,
    overlayOpacity,
  });
  useEffect(() => {
    if (!file) return;

    persistOverlayState(localStorage, {
      overlayPosition,
      overlaySize,
      overlayOpacity,
    });
  }, [overlayPosition, overlaySize, overlayOpacity, file]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    resize: true,
    trim: false,
    rotation: false,
    text: false,
    audio: false,
    export: false,
  });
  useEffect(() => {
    const restored = loadOverlayState(localStorage, {
      overlayPosition: initialOverlayState.current.overlayPosition,
      overlaySize: initialOverlayState.current.overlaySize,
      overlayOpacity: initialOverlayState.current.overlayOpacity,
    });

    if (restored.overlayPosition) setOverlayPosition(restored.overlayPosition);
    if (typeof restored.overlaySize === "number") setOverlaySize(restored.overlaySize);
    if (typeof restored.overlayOpacity === "number") setOverlayOpacity(restored.overlayOpacity);
  }, [setOverlayOpacity, setOverlayPosition, setOverlaySize]);

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const downloadRef = useRef<HTMLDivElement>(null);

  /**
   * Updates a text overlay property and syncs with recipe.
   */
  const handleUpdateTextOverlay = (id: string, updates: Partial<TextOverlay>) => {
    const updatedOverlays = (recipe.textOverlays || []).map((overlay) =>
      overlay.id === id ? { ...overlay, ...updates } : overlay
    );
    updateRecipe({ textOverlays: updatedOverlays });
  };

  const handleCopyLink = () => {
    if (typeof window === "undefined") return;
    const encoded = btoa(JSON.stringify(recipe));
    const url = new URL(window.location.href);
    url.searchParams.set("settings", encoded);
    history.replaceState(null, "", url.toString());
    navigator.clipboard.writeText(url.toString()).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  useEffect(() => {
    if (status === "done" && downloadRef.current) {
      
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      downloadRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? "instant" : "smooth",
        block: "center",
      });
    }
  }, [status]);


  const isProcessing = status === "loading-engine" || status === "exporting";
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(typeof navigator !== "undefined" && /Mac/i.test(navigator.platform));
  }, []);

  const intervalSeconds = useMemo(() => {
    if (duration <= 30) return 2;
    if (duration <= 120) return 5;
    if (duration <= 300) return 15;
    return 30;
  }, [duration]);

  const videoSrc = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );

  const exportSummary = useMemo(() => {
    const preset = getPresetById(recipe.preset);
    const width = recipe.preset === "custom" ? recipe.customWidth : (preset?.width ?? recipe.customWidth);
    const height = recipe.preset === "custom" ? recipe.customHeight : (preset?.height ?? recipe.customHeight);

    const framingLabel = recipe.framing === "fit" ? "Fit" : "Fill";
    const speedLabel = `${recipe.speed}× speed`;
    const qualityLabel = recipe.quality <= 21
      ? "High"
      : recipe.quality <= 25
      ? "Balanced"
      : "Small file";

    return `Exporting to ${width}×${height} ${recipe.format.toUpperCase()} • ${framingLabel} • ${speedLabel} • Quality: ${qualityLabel}`;
  }, [recipe]);

  useEffect(() => {
    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  return (
    <div className="relative flex flex-col" style={{ background: "var(--bg)" }}>
      <ExportOverlay
        status={status}
        progress={progress}
        exportStartedAt={exportStartedAt}
        onCancel={cancelExport}
      />
      <OnboardingTour />

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {status === "exporting" && `Exporting video: ${progress}%`}
        {status === "done" && "Export complete! Video ready to download."}
        {status === "error" && `Export failed: ${error}`}
      </div>

      <div className={cn(
        "max-w-6xl mx-auto px-4 py-8 pb-6 flex-1 w-full",
        // Reserve space on mobile so the fixed export bar never covers content.
        file && "max-lg:pb-28"
      )}>
        <header className="mb-10 flex flex-col items-center justify-center gap-4 animate-fade-in">
        <div
          className="inline-block rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm border-l-4 border-l-film-600 mx-auto w-fit min-w-min"
          style={{ padding: 'clamp(0.75rem,3vw,1.25rem) clamp(1rem,5vw,2rem)', boxSizing: 'border-box' }}
          aria-label="Reframe — video editor"
        >
        <h1
          className="font-display leading-none tracking-widest2 text-[var(--text)] break-words text-center transition-all"
          style={{ fontSize: 'clamp(2rem,10vw,4rem)', viewTransitionName: 'reframe-text' }}
        >
          REFRAME
        </h1>
        <p
          className="font-heading text-[var(--muted)] uppercase tracking-widest text-center"
          style={{
            fontSize: 'clamp(0.7rem,2vw,0.875rem)',
            marginTop: 'clamp(0.25rem,1vw,0.5rem)',
          }}
        >
          Your video, any format
        </p>
    <div
      className="flex md:hidden items-center justify-center gap-2 font-heading font-semibold uppercase tracking-widest text-[var(--muted)] border-t border-[var(--border)]"
      style={{
        fontSize: 'clamp(0.6rem,1.5vw,0.75rem)',
        marginTop: 'clamp(0.5rem,2vw,0.75rem)',
        paddingTop: 'clamp(0.5rem,2vw,0.75rem)',
      }}
    >
      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent)] inline-block animate-pulse" />
      No login. No ads. 100% private.
    </div>
  </div>  
  <div
    className="flex flex-wrap justify-center text-center items-center gap-2 text-sm font-heading font-semibold uppercase tracking-widest text-[var(--muted)] pb-1"
    style={{ justifyContent: 'center', textAlign: 'center', margin: '0', width: 'auto' }}
  >
    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent)] inline-block animate-pulse" />
    No login. No ads. 100% private - your video never leaves your device.
  </div>
    </header>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

          <div className="space-y-4 min-w-0">
            {!file && <PrivacyBanner />}
            <div className="bg-[var(--surface)] rounded-xl p-3 border border-[var(--border)] animate-fade-in">
              <FileUpload onFileSelect={handleFileSelect} currentFile={file} fileError={fileError} duration={duration} />

              {!file && (
                <div className="text-center text-[var(--muted)] py-6">
                  <p>Upload a video to get started</p>
                  <p className="text-sm">Supports MP4, MOV, WebM and more</p>
                </div>
              )}

              {file && (
                <div className="mt-4 animate-fade-in">
                  <VideoPreview
                    file={file}
                    recipe={recipe}
                    videoRef={videoRef}
                    selectedTextId={selectedTextId}
                    onSelectText={setSelectedTextId}
                    onUpdateText={handleUpdateTextOverlay}
                  />

                  <div className="mt-3">
                    <ThumbnailStrip
                      videoSrc={videoSrc}
                      duration={duration}
                      currentTime={currentTime}
                      trimStart={recipe.trimStart ?? 0}
                      trimEnd={recipe.trimEnd ?? duration}
                      onSeek={seekTo}
                      intervalSeconds={intervalSeconds}
                    />
                  </div>
                </div>
              )}
            </div>

            {file && file.size > 100 * 1024 * 1024 && (
              <p className="text-[var(--warning)] text-sm">
                ⚠️ Large file - processing may take several minutes
              </p>
            )}
            {file && (
              <div className={cn(
                "grid grid-cols-1 gap-4",
                isProcessing && "pointer-events-none opacity-50"
              )}>
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 space-y-6">
                  <AccordionSection
                    id="trim"
                    icon={<Scissors size={12} />}
                    title="Trim"
                    isOpen={openSections.trim}
                    onToggle={() => toggleSection("trim")}
                    delay={50}
                  >
                    <TrimControl
                      recipe={recipe}
                      onChange={updateRecipe}
                      duration={duration}
                      file={file}
                    />
                  </AccordionSection>

                  <AccordionSection
                    id="rotation"
                    icon={<RotateCw size={12} />}
                    title="Rotation"
                    isOpen={openSections.rotation}
                    onToggle={() => toggleSection("rotation")}
                    delay={100}
                  >
                    <RotateControl recipe={recipe} onChange={updateRecipe} />
                  </AccordionSection>

                  <AccordionSection
                    id="text"
                    icon={<Type size={12} />}
                    title="Text Overlay"
                    isOpen={openSections.text}
                    onToggle={() => toggleSection("text")}
                    delay={110}
                  >
                    <TextControls
                      recipe={recipe}
                      onChange={updateRecipe}
                      selectedTextId={selectedTextId}
                      onSelectText={setSelectedTextId}
                    />
                  </AccordionSection>
                </div>
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 space-y-6">
                  <AccordionSection
                    id="audio"
                    icon={<Volume2 size={12} />}
                    title="Audio & Speed"
                    isOpen={openSections.audio}
                    onToggle={() => toggleSection("audio")}
                    delay={150}
                  >
                    <AudioSpeedControl recipe={recipe} onChange={updateRecipe} />
                  </AccordionSection>
                  <Section
                    icon={<SlidersHorizontal size={12} />}
                    title="Adjustments"
                    delay={175}
                  >
                    <div className="space-y-5">
                      {/* Brightness */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <label htmlFor="brightness-slider">Brightness</label>
                          <button
                            type="button"
                            onClick={() => updateRecipe({ brightness: 0 })}
                            className="text-film-500 hover:underline"
                            aria-label="reset brightness"
                          >
                            Reset
                          </button>
                        </div>
                        <input
                          id="brightness-slider"
                          type="range"
                          min="-1"
                          max="1"
                          step="0.1"
                          value={recipe.brightness}
                          onChange={(e) => updateRecipe({ brightness: Number(e.target.value) })}
                          aria-label="Adjust brightness"
                          className="w-full accent-film-600"
                        />
                      </div>
                      {/* Contrast */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <label htmlFor="contrast-slider">Contrast</label>
                          <button
                            type="button"
                            onClick={() => updateRecipe({ contrast: 1 })}
                            className="text-film-500 hover:underline"
                            aria-label="reset-contrast"
                          >
                            Reset
                          </button>
                        </div>
                        <input
                          id="contrast-slider"
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={recipe.contrast}
                          onChange={(e) => updateRecipe({ contrast: Number(e.target.value) })}
                          aria-label="Adjust contrast"
                          className="w-full accent-film-600"
                        />
                      </div>
                      {/* Saturation */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <label htmlFor="saturation-slider">Saturation</label>
                          <button
                            type="button"
                            onClick={() => updateRecipe({ saturation: 1 })}
                            className="text-film-500 hover:underline"
                            aria-label="reset-saturation"
                          >
                            Reset
                          </button>
                        </div>
                        <input
                          id="saturation-slider"
                          type="range"
                          min="0"
                          max="3"
                          step="0.1"
                          value={recipe.saturation}
                          onChange={(e) => updateRecipe({ saturation: Number(e.target.value) })}
                          aria-label="Adjust saturation"
                          className="w-full accent-film-600"
                        />
                      </div>
                      {/* Sharpness */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <label htmlFor="sharpness-slider">Sharpness</label>
                          <button
                            type="button"
                            onClick={() => updateRecipe({ sharpness: 0 })}
                            className="text-film-500 hover:underline"
                          >
                            Reset
                          </button>
                        </div>
                        <input
                          id="sharpness-slider"
                          type="range"
                          min="0"
                          max="3"
                          step="1"
                          value={recipe.sharpness}
                          onChange={(e) => updateRecipe({ sharpness: Number(e.target.value) })}
                          aria-label="Adjust sharpness"
                          className="w-full accent-film-600"
                        />
                      </div>
                    </div>
                  </Section>
                  <Section icon={<SlidersHorizontal size={12} />} title="Output format" delay={190}>
                    <FormatSelector recipe={recipe} onChange={updateRecipe} />
                  </Section>
                  <AccordionSection
                    id="export"
                    icon={<SlidersHorizontal size={12} />}
                    title="Export"
                    isOpen={openSections.export}
                    onToggle={() => toggleSection("export")}
                    delay={200}
                  >
                    <ExportSettings recipe={recipe} duration={duration} onChange={updateRecipe} />
                  </AccordionSection>
                  <Section icon={<Layers size={12} />} title="Image overlay" delay={120}>
                    <ImageOverlay
                      overlayFile={overlayFile}
                      setOverlayFile={setOverlayFile}
                      overlayPosition={overlayPosition}
                      setOverlayPosition={setOverlayPosition}
                      overlaySize={overlaySize}
                      setOverlaySize={setOverlaySize}
                      overlayOpacity={overlayOpacity}
                      setOverlayOpacity={setOverlayOpacity}
                    />
                  </Section>
                </div>
              </div>
            )}

            {status === "error" && error && (
              <div
                role="status"
                className="flex items-start gap-3 p-4 bg-film-50 border border-film-200 rounded-xl text-film-800 text-sm animate-fade-in"
              >
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-film-500" />
                <div className="flex-1">
                  <p className="font-heading font-bold text-sm">Error</p>
                  <p className="text-film-600 text-sm mt-1">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(error).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }).catch((err) => {
                      console.error("Failed to copy error to clipboard:", err);
                    });
                  }}
                  className="px-3 py-1.5 bg-[var(--border)] border border-[var(--border)] rounded-lg text-sm font-semibold hover:opacity-80 transition-colors shrink-0 whitespace-nowrap"
                  aria-label="Copy error message to clipboard"
                >
                  {copied ? "Copied!" : "Copy error"}
                </button>
                {!error.includes("Validation Failed") && (
                  <button
                    type="button"
                    onClick={handleExport}
                    className="px-3 py-1.5 bg-[var(--error-bg)] border border-[var(--error-border)] rounded-lg text-sm font-semibold hover:bg-[var(--error-hover)] hover:border-[var(--error)] text-[var(--text)] transition-colors shrink-0 whitespace-nowrap"
                  >
                    Retry Export
                  </button>
                )}
              </div>
            )}

            {status === "done" && result && (
              <div role="status" className="animate-fade-in" ref={downloadRef}>
                <DownloadResult result={result} onReset={reset} soundOnCompletion={recipe.soundOnCompletion} onToggleSound={toggleSound} />
              </div>
            )}
          </div>

          <div className={cn(
            "space-y-5 transition-opacity duration-300 sticky top-8 self-start",
            (isProcessing || !file) && "pointer-events-none opacity-50"
          )}>
            {!file && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 animate-fade-in">
                <p className="text-[10px] font-heading font-bold text-film-600 uppercase tracking-widest">
                  Getting Started
                </p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Upload a video file to enable these export settings.
                </p>
              </div>
            )}
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 space-y-6 animate-fade-in" style={{ animationDelay: "50ms" }}>
              <AccordionSection
                id="resize"
                icon={<Layers size={12} />}
                title="Resize & Aspect Ratio"
                isOpen={openSections.resize}
                onToggle={() => toggleSection("resize")}
                delay={50}
              >
                {recommendedPreset && (
                  <div className="mb-4 rounded-2xl border border-film-200 bg-film-50 p-3 text-sm text-film-700">
                    <p>
                      We detected a {recommendedPreset.label.replace(/\s/g, "")} video → Recommended: {(recommendedPreset.platform.split("·")[0] ?? "").trim()} ({recommendedPreset.label.replace(/\s/g, "")})
                    </p>
                  </div>
                )}
                <div className="space-y-3">
                  <PresetSelector recipe={recipe} onChange={updateRecipe} />
                  <FramingControl recipe={recipe} onChange={updateRecipe} />
                </div>
              </AccordionSection>

              <div className="pt-2 flex justify-center items-center gap-6">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-widest text-film-500 hover:text-film-600 hover:opacity-100 transition-all cursor-pointer"
                >
                  <Copy size={12} />
                  {shareCopied ? "Copied!" : "Copy Link"}
                </button>
                <button
                  type="button"
                  onClick={resetSettings}
                  className="text-sm font-heading font-bold uppercase tracking-widest text-[var(--muted)] hover:text-film-600 transition-all opacity-60 hover:opacity-100"
                >
                  Clear saved session
                </button>
              </div>
            </div>

            <KeyboardShortcutsPanel />

            {file && (
              <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)] leading-relaxed">
                {exportSummary}
              </p>
            )}

            <button
              id="export-button"
              type="button"
              onClick={handleExport}
                disabled={!file || isProcessing}
                aria-label='Export video'
                aria-disabled={!file || isProcessing ? "true" : undefined}
                title={!file ? "Upload a video to enable export" : undefined}
              className={cn(
                // Hidden on mobile — replaced by the fixed bottom bar below.
                "w-full hidden lg:flex items-center justify-center gap-3 py-5 min-h-[44px] rounded-xl",
                "font-display text-2xl tracking-widest transition-all duration-200",
                file && !isProcessing
                  ? "bg-[var(--accent)] hover:bg-[var(--accent-hover)] hover:scale-[1.02] text-white shadow-[var(--shadow)] active:scale-[0.98] cursor-pointer"
                  : "bg-[var(--border)] text-[var(--muted)] cursor-not-allowed"
              )}
            >
             <Zap size={20} className={cn(file && !isProcessing && "animate-pulse")} />
              {isProcessing ? "PROCESSING" : "EXPORT"}
            </button>

            {file && !isProcessing && (
              <p className="hidden lg:block text-xs text-center font-mono text-[var(--muted)] opacity-50 mt-1">
                {isMac ? "⌘" : "Ctrl"} + Enter to export
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile-only export bar — keeps Export reachable without scrolling to the sidebar. */}
      {file && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleExport}
            disabled={isProcessing}
            aria-label="Export video"
            aria-disabled={isProcessing ? "true" : undefined}
            className={cn(
              "w-full flex items-center justify-center gap-3 py-4 min-h-[44px] rounded-xl",
              "font-display text-xl tracking-widest transition-all duration-200",
              !isProcessing
                ? "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-[var(--shadow)] active:scale-[0.98] cursor-pointer"
                : "bg-[var(--border)] text-[var(--muted)] cursor-not-allowed"
            )}
          >
            <Zap size={18} className={cn(!isProcessing && "animate-pulse")} />
            {isProcessing ? "PROCESSING" : "EXPORT"}
          </button>
        </div>
      )}
    </div>
  );
}
