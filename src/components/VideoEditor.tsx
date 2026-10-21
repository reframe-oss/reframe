"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
import ExportOverlay, { type ExportSummary } from "./ExportOverlay";
import DownloadResult from "./DownloadResult";
import ImageOverlay from "./ImageOverlay";
import AdjustmentsControl, { hasAdjustments } from "./AdjustmentsControl";
import { getPresetById } from "@/lib/presets";
import { pickThumbnailInterval } from "@/lib/thumbnails";

import { cn, formatDuration } from "@/lib/utils";
import {
  Layers,
  Scissors,
  RotateCw,
  Volume2,
  Type,
  SlidersHorizontal,
  AlertTriangle,
  Copy,
  Check,
  Download,
  ChevronDown,
  Keyboard,
} from "lucide-react";
import OnboardingTour from "./OnboardingTour";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { loadOverlayState, persistOverlayState } from "@/lib/editorPersistence";

/**
 * Collapsible tool section. Closed panels are removed with the `hidden`
 * attribute rather than animated (animating height forces layout on every
 * frame); only the chevron rotates. The optional summary shows the current
 * value while collapsed, so the panel doesn't have to be opened to check it.
 */
function AccordionSection({
  id,
  icon,
  title,
  summary,
  children,
  isOpen,
  onToggle,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary?: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <h3>
        <button
          type="button"
          id={`${id}-header`}
          aria-expanded={isOpen}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
          className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast hover:bg-[var(--surface-2)]"
        >
          <span aria-hidden="true" className="text-[var(--muted)]">
            {icon}
          </span>
          <span className="flex-1 text-sm font-medium text-[var(--text)]">{title}</span>
          {summary && (
            <span className="tabular truncate text-xs text-[var(--muted)]">{summary}</span>
          )}
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-[var(--muted)] transition-transform duration-base",
              isOpen && "rotate-180"
            )}
          />
        </button>
      </h3>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-header`}
        hidden={!isOpen}
        className="px-4 pb-4 pt-1"
      >
        {children}
      </div>
    </div>
  );
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Space"], label: "Play / pause preview" },
  { keys: ["⌘/Ctrl", "Enter"], label: "Export video" },
  { keys: ["⌘/Ctrl", "Shift", "E"], label: "Export video" },
  { keys: ["Esc"], label: "Cancel export" },
  { keys: ["I"], label: "Set trim start at playhead" },
  { keys: ["O"], label: "Set trim end at playhead" },
  { keys: ["M"], label: "Mute / unmute audio" },
  { keys: ["1", "–", "9"], label: "Choose preset by position" },
  { keys: ["R"], label: "Reset all settings" },
  { keys: ["⌘/Ctrl", "O"], label: "Open a video" },
  { keys: ["?"], label: "Show or hide this list" },
];

/** Collapsible list of keyboard shortcuts (also toggled with "?"). */
function KeyboardShortcutsPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="keyboard-shortcuts-list"
        onClick={onToggle}
        className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors duration-fast hover:bg-[var(--surface-2)]"
      >
        <Keyboard size={15} aria-hidden="true" className="text-[var(--muted)]" />
        <span className="flex-1">Keyboard shortcuts</span>
        <kbd className="kbd">?</kbd>
      </button>

      {open && (
        <ul id="keyboard-shortcuts-list" className="space-y-2 border-t border-[var(--border)] px-4 py-3">
          {SHORTCUTS.map(({ keys, label }) => (
            <li key={label + keys.join()} className="flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--muted)]">{label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {keys.map((k) =>
                  k === "–" ? (
                    <span key={k} className="text-xs text-[var(--muted)]">
                      –
                    </span>
                  ) : (
                    <kbd key={k} className="kbd">
                      {k}
                    </kbd>
                  )
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function qualityLabel(crf: number) {
  return crf <= 21 ? "High" : crf <= 25 ? "Balanced" : "Small file";
}

export default function VideoEditor() {
  const {
    file,
    duration,
    recipe,
    status,
    progress,
    result,
    error,
    exportStartedAt,
    updateRecipe,
    handleFileSelect,
    fileError,
    handleExport,
    cancelExport,
    reset,
    resetSettings,
    videoRef,
    seekTo,
    overlayFile,
    setOverlayFile,
    overlayPosition,
    setOverlayPosition,
    overlaySize,
    setOverlaySize,
    overlayOpacity,
    setOverlayOpacity,
    recommendedPreset,
    getCurrentTime,
    toggleSound,
  } = useVideoEditor();

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const toggleShortcuts = useCallback(() => setShortcutsOpen((v) => !v), []);

  useKeyboardShortcuts({
    file,
    recipe,
    resetSettings,
    updateRecipe,
    handleExport,
    status,
    cancelExport,
    onToggleShortcutsModal: toggleShortcuts,
    getCurrentTime,
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
    adjust: false,
    text: false,
    audio: false,
    overlay: false,
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
    const encoded = encodeURIComponent(JSON.stringify(recipe));
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
    // Genuinely needs an effect: navigator is a browser-only API, unavailable
    // during SSR/render, so it can't be computed as derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(typeof navigator !== "undefined" && /Mac/i.test(navigator.platform));
  }, []);

  const intervalSeconds = useMemo(() => pickThumbnailInterval(duration), [duration]);

  const videoSrc = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const output = useMemo(() => {
    const preset = getPresetById(recipe.preset);
    const width =
      recipe.preset === "custom" ? recipe.customWidth : (preset?.width ?? recipe.customWidth);
    const height =
      recipe.preset === "custom" ? recipe.customHeight : (preset?.height ?? recipe.customHeight);
    const summary: ExportSummary = {
      format: recipe.format.toUpperCase(),
      resolution: `${width} × ${height}`,
      quality: `${qualityLabel(recipe.quality)} (CRF ${recipe.quality})`,
    };
    return {
      summary,
      presetLabel: recipe.preset === "custom" ? "Custom" : (preset?.label ?? "Custom"),
      framing: recipe.framing === "fit" ? "Fit" : "Fill",
    };
  }, [
    recipe.preset,
    recipe.customWidth,
    recipe.customHeight,
    recipe.format,
    recipe.quality,
    recipe.framing,
  ]);

  useEffect(() => {
    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  const isTrimmed = recipe.trimStart > 0 || recipe.trimEnd !== null;
  const textCount = recipe.textOverlays?.length ?? 0;
  const exportDisabled = !file || isProcessing;
  const exportShortcut = isMac ? "⌘ Enter" : "Ctrl Enter";

  return (
    <div className="relative flex flex-col">
      <ExportOverlay
        status={status}
        progress={progress}
        exportStartedAt={exportStartedAt}
        onCancel={cancelExport}
        summary={output.summary}
      />
      <OnboardingTour />

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {status === "exporting" && progress % 10 === 0 && `Exporting video: ${progress}%`}
        {status === "done" && "Export complete. Video ready to download."}
        {status === "error" && `Export failed: ${error}`}
      </div>

      <div
        className={cn(
          "mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:py-8",
          // Reserve space on mobile so the fixed export bar never covers content.
          file && "max-lg:pb-28"
        )}
      >
        {file ? (
          <h1 className="sr-only">Reframe editor</h1>
        ) : (
          <header className="mb-6 max-w-2xl">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Resize, trim and export video in your browser
            </h1>
            <p className="mt-2 text-base text-[var(--text-secondary)]">
              Reformat a clip for any platform without an account, an upload or a watermark.
              Everything runs on this device.
            </p>
          </header>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {/* ── Workspace: preview first, then the tools that change it ── */}
          <div className="min-w-0 space-y-4">
            {!file && <PrivacyBanner />}

            <section aria-labelledby="video-heading" className="panel p-3 sm:p-4">
              <h2 id="video-heading" className="sr-only">
                Video
              </h2>
              <FileUpload
                onFileSelect={handleFileSelect}
                currentFile={file}
                fileError={fileError}
                duration={duration}
              />

              {file && (
                <>
                  <div className="mt-3">
                    <VideoPreview
                      file={file}
                      recipe={recipe}
                      videoRef={videoRef}
                      selectedTextId={selectedTextId}
                      onSelectText={setSelectedTextId}
                      onUpdateText={handleUpdateTextOverlay}
                    />
                  </div>

                  <div className="mt-4 border-t border-[var(--border)] pt-3">
                    <ThumbnailStrip
                      videoSrc={videoSrc}
                      duration={duration}
                      videoRef={videoRef}
                      trimStart={recipe.trimStart ?? 0}
                      trimEnd={recipe.trimEnd ?? duration}
                      onSeek={seekTo}
                      intervalSeconds={intervalSeconds}
                    />
                  </div>
                </>
              )}
            </section>

            {file && file.size > 100 * 1024 * 1024 && (
              <p role="status" className="callout callout-warning text-xs">
                <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--warning)]" />
                Large file: export can take several minutes. Keep this tab in the foreground.
              </p>
            )}

            {status === "error" && error && (
              <div role="alert" className="callout callout-error">
                <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--error)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {error.includes("Validation Failed") ? "This file can't be opened" : "Export didn't finish"}
                  </p>
                  <p className="mt-0.5 text-[var(--text-secondary)]">{error}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!error.includes("Validation Failed") && (
                      <button type="button" onClick={handleExport} className="btn btn-primary btn-sm">
                        Retry export
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard
                          .writeText(error)
                          .then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          })
                          .catch((err) => {
                            console.error("Failed to copy error to clipboard:", err);
                          });
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                      {copied ? "Copied" : "Copy error details"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {status === "done" && result && (
              <div role="status" className="animate-fade-in" ref={downloadRef}>
                <DownloadResult
                  result={result}
                  onReset={reset}
                  soundOnCompletion={recipe.soundOnCompletion}
                  onToggleSound={toggleSound}
                />
              </div>
            )}

            {file && (
              <section
                aria-labelledby="edit-heading"
                inert={isProcessing}
                className={cn(
                  "panel divide-y divide-[var(--border)] overflow-hidden",
                  isProcessing && "opacity-60"
                )}
              >
                <h2 id="edit-heading" className="sr-only">
                  Edit
                </h2>
                <AccordionSection
                  id="trim"
                  icon={<Scissors size={15} />}
                  title="Trim"
                  summary={
                    isTrimmed
                      ? `${formatDuration(recipe.trimStart)} – ${formatDuration(recipe.trimEnd ?? duration)}`
                      : "Full length"
                  }
                  isOpen={openSections.trim}
                  onToggle={() => toggleSection("trim")}
                >
                  <TrimControl recipe={recipe} onChange={updateRecipe} duration={duration} file={file} />
                </AccordionSection>

                <AccordionSection
                  id="rotation"
                  icon={<RotateCw size={15} />}
                  title="Rotate"
                  summary={`${recipe.rotate}°`}
                  isOpen={openSections.rotation}
                  onToggle={() => toggleSection("rotation")}
                >
                  <RotateControl recipe={recipe} onChange={updateRecipe} />
                </AccordionSection>

                <AccordionSection
                  id="adjust"
                  icon={<SlidersHorizontal size={15} />}
                  title="Adjust colour"
                  summary={hasAdjustments(recipe) ? "Modified" : "None"}
                  isOpen={openSections.adjust}
                  onToggle={() => toggleSection("adjust")}
                >
                  <AdjustmentsControl recipe={recipe} onChange={updateRecipe} />
                </AccordionSection>

                <AccordionSection
                  id="text"
                  icon={<Type size={15} />}
                  title="Text"
                  summary={textCount > 0 ? `${textCount} ${textCount === 1 ? "layer" : "layers"}` : "None"}
                  isOpen={openSections.text}
                  onToggle={() => toggleSection("text")}
                >
                  <TextControls
                    recipe={recipe}
                    onChange={updateRecipe}
                    selectedTextId={selectedTextId}
                    onSelectText={setSelectedTextId}
                  />
                </AccordionSection>

                <AccordionSection
                  id="audio"
                  icon={<Volume2 size={15} />}
                  title="Audio and speed"
                  summary={`${recipe.speed}× · ${recipe.keepAudio ? "Audio on" : "Muted"}`}
                  isOpen={openSections.audio}
                  onToggle={() => toggleSection("audio")}
                >
                  <AudioSpeedControl recipe={recipe} onChange={updateRecipe} />
                </AccordionSection>

                <AccordionSection
                  id="overlay"
                  icon={<Layers size={15} />}
                  title="Image overlay"
                  summary={overlayFile ? "1 image" : "None"}
                  isOpen={openSections.overlay}
                  onToggle={() => toggleSection("overlay")}
                >
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
                </AccordionSection>
              </section>
            )}

            <KeyboardShortcutsPanel open={shortcutsOpen} onToggle={toggleShortcuts} />
          </div>

          {/* ── Output: what gets produced, and the action that produces it ── */}
          {/* On desktop the panel is capped at the viewport height: settings
              scroll inside it and the summary + Export button stay pinned, so
              the primary action is always visible. */}
          <aside aria-labelledby="output-heading" className="lg:sticky lg:top-[72px]">
            <section
              inert={exportDisabled}
              className={cn(
                "panel flex flex-col overflow-hidden lg:max-h-[calc(100vh-96px)]",
                exportDisabled && "opacity-60"
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                <h2 id="output-heading" className="text-base font-semibold">
                  Output
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="btn btn-ghost btn-sm"
                    title="Copy a link that reopens Reframe with these settings"
                  >
                    {shareCopied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                    {shareCopied ? "Copied" : "Copy settings link"}
                  </button>
                </div>
              </div>

              {!file && (
                <p className="border-b border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
                  Open a video to choose its output size, format and quality.
                </p>
              )}

              <div className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto overscroll-contain">
                <AccordionSection
                  id="resize"
                  icon={<Layers size={15} />}
                  title="Size and framing"
                  summary={`${output.presetLabel} · ${output.framing}`}
                  isOpen={openSections.resize}
                  onToggle={() => toggleSection("resize")}
                >
                  {recommendedPreset && (
                    <p className="callout callout-info mb-3 text-xs">
                      This video is {recommendedPreset.label.replace(/\s/g, "")}. Suggested preset:{" "}
                      {(recommendedPreset.platform.split("·")[0] ?? "").trim()} (
                      {recommendedPreset.label.replace(/\s/g, "")}).
                    </p>
                  )}
                  <div className="space-y-3">
                    <PresetSelector recipe={recipe} onChange={updateRecipe} />
                    <FramingControl recipe={recipe} onChange={updateRecipe} />
                  </div>
                </AccordionSection>

                <div className="px-4 py-4">
                  <FormatSelector recipe={recipe} onChange={updateRecipe} />
                </div>

                <AccordionSection
                  id="export"
                  icon={<SlidersHorizontal size={15} />}
                  title="Quality and processing"
                  summary={qualityLabel(recipe.quality)}
                  isOpen={openSections.export}
                  onToggle={() => toggleSection("export")}
                >
                  <div className="space-y-5">
                    <ExportSettings recipe={recipe} duration={duration} onChange={updateRecipe} />
                  </div>
                </AccordionSection>
              </div>

              <div className="shrink-0 space-y-3 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                {file && (
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-[var(--muted)]">Format</dt>
                      <dd className="font-medium">{output.summary.format}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">Size</dt>
                      <dd className="tabular font-medium">{output.summary.resolution}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">Quality</dt>
                      <dd className="font-medium">{qualityLabel(recipe.quality)}</dd>
                    </div>
                  </dl>
                )}
                <button
                  id="export-button"
                  type="button"
                  onClick={handleExport}
                  disabled={exportDisabled}
                  title={!file ? "Open a video to enable export" : `Export (${exportShortcut})`}
                  // Hidden on mobile — replaced by the fixed bottom bar below.
                  // After a successful export, Download is the primary action,
                  // so this steps down to secondary.
                  className={cn(
                    "btn btn-lg hidden w-full lg:inline-flex",
                    status === "done" ? "btn-secondary" : "btn-primary"
                  )}
                >
                  <Download size={16} aria-hidden="true" />
                  {isProcessing ? "Exporting…" : status === "done" ? "Export again" : "Export video"}
                </button>
                <div className="hidden items-center justify-between text-2xs text-[var(--muted)] lg:flex">
                  <span>
                    <kbd className="kbd">{isMac ? "⌘" : "Ctrl"}</kbd> <kbd className="kbd">Enter</kbd> to export
                  </span>
                  <button
                    type="button"
                    onClick={resetSettings}
                    className="rounded underline-offset-2 hover:text-[var(--text)] hover:underline"
                    title="Reset settings and forget the saved video"
                  >
                    Clear saved session
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Mobile-only export bar — keeps Export reachable without scrolling to the sidebar. */}
      {file && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1 text-xs">
              <p className="truncate font-medium">
                {output.summary.format} · {output.summary.resolution}
              </p>
              <p className="truncate text-[var(--muted)]">{qualityLabel(recipe.quality)} quality</p>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={isProcessing}
              className="btn btn-primary btn-lg shrink-0"
            >
              <Download size={16} aria-hidden="true" />
              {isProcessing ? "Exporting…" : "Export"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
