"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useVideoEditor } from "@/hooks/useVideoEditor";
import { TextOverlay } from "@/lib/types";
import FileUpload from "./FileUpload";
import PrivacyBanner from "./PrivacyBanner";
import VideoPreview from "./VideoPreview";
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
import ExportProfiles from "./ExportProfiles";
import { useExportProfiles } from "@/hooks/useExportProfiles";
import { BUILT_IN_PROFILES, profileMatches } from "@/lib/exportProfiles";
import { resolveOutputSize } from "@/lib/ffmpegArgs";
import { trackFeature } from "@/lib/featureTelemetry";
import { installSelfTest } from "@/lib/selfTest";
import { deepEqual } from "@/lib/editHistory";
import { getPresetById } from "@/lib/presets";
import { useTimelineFrames } from "@/hooks/useTimelineFrames";

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
  Bookmark,
  Files,
} from "lucide-react";
import OnboardingTour from "./OnboardingTour";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import HistoryControls from "./HistoryControls";
import { RecoveryNotice } from "./RecoveryNotice";
import BatchExport from "./BatchExport";
import { useBatchExport } from "@/hooks/useBatchExport";

/**
 * Collapsible tool section. The panel animates open and closed through grid
 * rows (see `.disclosure` in globals.css), so nothing is measured in JS; once
 * closed, its content is visibility:hidden and leaves the tab order. The
 * optional summary shows the current value while collapsed, so the panel
 * doesn't have to be opened to check it.
 */
function AccordionSection({
  id,
  icon,
  title,
  summary,
  children,
  isOpen,
  onToggle,
  revealOnOpen = false,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary?: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  /** Scroll the section to the top of its scroll area when opened (the output panel), so its content shows instead of opening below the fold. */
  revealOnOpen?: boolean;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={sectionRef}>
      <h3>
        <button
          type="button"
          id={`${id}-header`}
          aria-expanded={isOpen}
          aria-controls={`${id}-panel`}
          onClick={() => {
            onToggle();
            if (!revealOnOpen || isOpen) return;
            // Once it has expanded, scroll only the panel's own scroll area
            // (never the page behind it) so the section starts at its top.
            const section = sectionRef.current;
            const area = section?.closest<HTMLElement>("[data-scroll-area]");
            if (!section || !area) return;
            const reveal = () => {
              if (area.scrollHeight <= area.clientHeight) return;
              const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              area.scrollTo({
                top: area.scrollTop + section.getBoundingClientRect().top - area.getBoundingClientRect().top,
                behavior: reduce ? "auto" : "smooth",
              });
            };
            window.setTimeout(reveal, 320);
          }}
          className="group flex min-h-[50px] w-full items-center gap-3 px-1 py-2.5 text-left"
        >
          <span
            aria-hidden="true"
            className="text-[var(--muted)] transition-colors duration-fast group-hover:text-[var(--text)]"
          >
            {icon}
          </span>
          <span className="flex-1 text-sm font-medium text-[var(--text)]">{title}</span>
          {summary && (
            <span className="tabular truncate text-xs text-[var(--muted)]">{summary}</span>
          )}
          <ChevronDown
            size={15}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-[var(--muted)] transition-transform duration-panel ease-standard group-hover:text-[var(--text)]",
              isOpen && "rotate-180"
            )}
          />
        </button>
      </h3>
      <div className="disclosure" data-open={isOpen}>
        <div
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-header`}
          className="disclosure-inner"
        >
          <div className="px-1 pb-5 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** "(2)  Edit" — the reference's parenthetical marker beside a serif title. */
function SectionHead({
  id,
  marker,
  title,
  children,
  visuallyHidden,
}: {
  id: string;
  marker: string;
  title: string;
  children?: React.ReactNode;
  visuallyHidden?: boolean;
}) {
  if (visuallyHidden) {
    return (
      <h2 id={id} className="sr-only">
        {title}
      </h2>
    );
  }
  return (
    <div className="section-head">
      <span className="marker" aria-hidden="true">
        ({marker})
      </span>
      <h2 id={id} className="serif text-2xl leading-none">
        {title}
      </h2>
      {children && <div className="ml-auto flex items-center gap-1">{children}</div>}
    </div>
  );
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Space"], label: "Play / pause preview" },
  { keys: ["⌘/Ctrl", "Enter"], label: "Export video" },
  { keys: ["⌘/Ctrl", "Shift", "E"], label: "Export video" },
  { keys: ["Esc"], label: "Cancel export" },
  { keys: ["⌘/Ctrl", "Z"], label: "Undo" },
  { keys: ["⌘/Ctrl", "Shift", "Z"], label: "Redo (or Ctrl Y)" },
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
    <div className="border-b border-[var(--border)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="keyboard-shortcuts-list"
        onClick={onToggle}
        className="group flex min-h-[46px] w-full items-center gap-2 px-1 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors duration-fast hover:text-[var(--text)]"
      >
        <Keyboard size={15} aria-hidden="true" className="text-[var(--muted)] group-hover:text-[var(--text)]" />
        <span className="flex-1">Keyboard shortcuts</span>
        <kbd className="kbd">?</kbd>
      </button>

      {open && (
        <ul id="keyboard-shortcuts-list" className="enter grid gap-x-8 gap-y-2 px-1 pb-4 pt-1 sm:grid-cols-2" style={{ "--enter-delay": "0ms" } as React.CSSProperties}>
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
    applyExportProfile,
    videoRef,
    seekTo,
    musicFile,
    musicVolume,
    originalAudioVolume,
    loopMusic,
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
    exportNotice,
    canUndo,
    canRedo,
    undo,
    redo,
    recovery,
    discardRecovery,
  } = useVideoEditor();

  const exportProfiles = useExportProfiles();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // window.__reframeSelfTest for the Datadog Synthetic check (src/lib/selfTest.ts).
  useEffect(() => installSelfTest(), []);
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
    undo,
    redo,
  });

  const [shareCopied, setShareCopied] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    profile: false,
    resize: true,
    trim: false,
    rotation: false,
    adjust: false,
    text: false,
    audio: false,
    overlay: false,
    batch: false,
    export: false,
  });
  // Overlay settings are part of the undoable edit and the saved project
  // (useVideoEditor), so they aren't persisted separately here.

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

  const batch = useBatchExport();
  const timelineFrames = useTimelineFrames(file, duration, isProcessing || batch.running);

  const output = useMemo(() => {
    const preset = getPresetById(recipe.preset);
    // The size FFmpeg actually encodes (even-rounded), not the raw input.
    const { width, height } = resolveOutputSize({
      preset: recipe.preset,
      customWidth: recipe.customWidth,
      customHeight: recipe.customHeight,
    });
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


  const isTrimmed = recipe.trimStart > 0 || recipe.trimEnd !== null;
  const textCount = recipe.textOverlays?.length ?? 0;
  // A batch uses the same engine, so the editor's own export waits for it.
  const exportDisabled = !file || isProcessing || batch.running;
  const exportShortcut = isMac ? "⌘ Enter" : "Ctrl Enter";

  return (
    <div className="relative flex flex-col">
      <ExportOverlay
        status={status}
        progress={progress}
        exportStartedAt={exportStartedAt}
        onCancel={cancelExport}
        summary={output.summary}
        notice={exportNotice}
      />
      <OnboardingTour />

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {status === "exporting" && progress % 10 === 0 && `Exporting video: ${progress}%`}
        {status === "done" && "Export complete. Video ready to download."}
        {status === "error" && `Export failed: ${error}`}
      </div>

      <div
        className={cn(
          "mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
          // Reserve space on mobile so the fixed export bar never covers content.
          file && "max-lg:pb-28"
        )}
      >
        {file ? (
          <h1 className="sr-only">Reframe editor</h1>
        ) : (
          // Editorial opening: the headline rises line by line out of a mask,
          // as the reference's titles do. Copy stays plain and functional.
          <header className="mb-8 grid gap-5 sm:mb-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end lg:gap-8">
            <h1 className="display text-[2.125rem] sm:text-5xl xl:text-6xl">
              <span className="line-mask">
                <span>Resize, trim and export</span>
              </span>
              <span className="line-mask" style={{ "--enter-delay": "90ms" } as React.CSSProperties}>
                <span>video in your browser</span>
              </span>
            </h1>
            <p
              className="enter max-w-sm text-sm leading-6 text-[var(--text-secondary)]"
              style={{ "--enter-delay": "260ms" } as React.CSSProperties}
            >
              Reformat a clip for any platform without an account, an upload or a watermark.
              Everything runs on this device.
            </p>
          </header>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
          {/* ── Workspace: preview first, then the tools that change it ── */}
          <div className="min-w-0 space-y-8">
            {!file && recovery && <RecoveryNotice recovery={recovery} onDiscard={discardRecovery} />}
            {!file && <PrivacyBanner />}

            {/* No entrance on this section: it holds the primary action (and
                the page's largest paint), so it is shown from the first frame. */}
            <section aria-labelledby="video-heading" className="space-y-4">
              <SectionHead id="video-heading" marker="1" title="Source" visuallyHidden={!file} />
              <FileUpload
                onFileSelect={handleFileSelect}
                currentFile={file}
                fileError={fileError}
                duration={duration}
              />

              {file && (
                <>
                  <div>
                    <VideoPreview
                      file={file}
                      recipe={recipe}
                      videoRef={videoRef}
                      selectedTextId={selectedTextId}
                      onSelectText={setSelectedTextId}
                      onUpdateText={handleUpdateTextOverlay}
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
                  {!error.includes("Validation Failed") && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={handleExport} className="btn btn-primary btn-sm">
                        Retry export
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {status === "done" && result && (
              // Not a live region: the editor's polite region above already
              // announces completion, and a status role here would read the
              // whole panel (file name field included) a second time.
              <div className="animate-fade-in" ref={downloadRef}>
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
                  "enter transition-opacity duration-base",
                  isProcessing && "opacity-60"
                )}
                style={{ "--enter-delay": "120ms" } as React.CSSProperties}
              >
                <SectionHead id="edit-heading" marker="2" title="Edit">
                  <HistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
                </SectionHead>
                <div className="divide-y divide-[var(--border)] border-b border-[var(--border)]">
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
                  <TrimControl
                    recipe={recipe}
                    onChange={updateRecipe}
                    duration={duration}
                    file={file}
                    frames={timelineFrames}
                    onSeek={seekTo}
                  />
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
                    duration={duration}
                    videoRef={videoRef}
                    outputHeight={resolveOutputSize(recipe).height}
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

                <AccordionSection
                  id="batch"
                  icon={<Files size={15} />}
                  title="Batch export"
                  summary={
                    batch.running
                      ? "Exporting…"
                      : batch.items.length > 0
                        ? `${batch.items.length} video${batch.items.length === 1 ? "" : "s"}`
                        : "Other videos"
                  }
                  isOpen={openSections.batch}
                  onToggle={() => toggleSection("batch")}
                >
                  <BatchExport
                    batch={batch}
                    editorBusy={isProcessing}
                    getSettings={() => ({
                      recipe,
                      music: { file: musicFile, musicVolume, originalAudioVolume, loopMusic },
                      overlay: { file: overlayFile, position: overlayPosition, size: overlaySize, opacity: overlayOpacity },
                    })}
                  />
                </AccordionSection>
                </div>
              </section>
            )}

            <KeyboardShortcutsPanel open={shortcutsOpen} onToggle={toggleShortcuts} />
          </div>

          {/* ── Output: what gets produced, and the action that produces it ── */}
          {/* On desktop the panel is capped at the viewport height: settings
              scroll inside it and the summary + Export button stay pinned, so
              the primary action is always visible. */}
          <aside
            aria-labelledby="output-heading"
            className="enter lg:sticky lg:top-[76px]"
            style={{ "--enter-delay": "200ms" } as React.CSSProperties}
          >
            <section
              inert={exportDisabled}
              className={cn(
                "panel flex flex-col overflow-hidden transition-opacity duration-base lg:max-h-[calc(100dvh-100px)]",
                exportDisabled && "opacity-60"
              )}
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border)] px-4 pb-3 pt-4">
                <div className="flex items-baseline gap-3">
                  {file && (
                    <span className="marker" aria-hidden="true">
                      (3)
                    </span>
                  )}
                  <h2 id="output-heading" className="serif text-2xl leading-none">
                    Output
                  </h2>
                </div>
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

              <div data-scroll-area className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto overscroll-contain px-3">
                <AccordionSection
                  id="profile"
                  revealOnOpen
                  icon={<Bookmark size={15} />}
                  title="Profile"
                  summary={
                    [...BUILT_IN_PROFILES, ...exportProfiles.profiles].find((p) => profileMatches(recipe, p.settings))
                      ?.name ?? "Custom settings"
                  }
                  isOpen={openSections.profile}
                  onToggle={() => toggleSection("profile")}
                >
                  <ExportProfiles
                    recipe={recipe}
                    userProfiles={exportProfiles.profiles}
                    status={exportProfiles.status}
                    onApply={(settings) => {
                      applyExportProfile(settings);
                      const builtIn = BUILT_IN_PROFILES.find((p) => deepEqual(p.settings, settings));
                      // Only the built-in slug or "custom": never a profile's name.
                      trackFeature("export_profile", "apply", { profile: builtIn?.id ?? "custom" });
                    }}
                    onSave={(name, settings) => {
                      const change = exportProfiles.save(name, settings);
                      if (change.ok) trackFeature("export_profile", "save");
                      return change;
                    }}
                    onRename={(id, name) => {
                      const change = exportProfiles.rename(id, name);
                      if (change.ok) trackFeature("export_profile", "rename");
                      return change;
                    }}
                    onDelete={(id) => {
                      const change = exportProfiles.remove(id);
                      if (change.ok) trackFeature("export_profile", "delete");
                      return change;
                    }}
                  />
                </AccordionSection>

                <AccordionSection
                  id="resize"
                  revealOnOpen
                  icon={<Layers size={15} />}
                  title="Size and framing"
                  summary={`${output.presetLabel} · ${output.framing}`}
                  isOpen={openSections.resize}
                  onToggle={() => toggleSection("resize")}
                >
                  {recommendedPreset && (
                    <p className="callout callout-info mb-3 px-3 py-2 text-xs">
                      Suggested for this {recommendedPreset.label.replace(/\s/g, "")} video:{" "}
                      {(recommendedPreset.platform.split("·")[0] ?? "").trim()}
                    </p>
                  )}
                  <div className="space-y-3">
                    <PresetSelector recipe={recipe} onChange={updateRecipe} />
                    <FramingControl recipe={recipe} onChange={updateRecipe} />
                  </div>
                </AccordionSection>

                <div className="px-1 py-4">
                  <FormatSelector recipe={recipe} onChange={updateRecipe} />
                </div>

                <AccordionSection
                  id="export"
                  revealOnOpen
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

              <div className="shrink-0 space-y-4 border-t border-[var(--border)] px-4 py-4">
                {file && (
                  <dl className="grid grid-cols-3 divide-x divide-[var(--border)] text-xs lg:[@media(max-height:820px)]:hidden">
                    <div className="pr-3">
                      <dt className="text-[var(--muted)]">Format</dt>
                      <dd className="mt-0.5 font-medium">{output.summary.format}</dd>
                    </div>
                    <div className="px-3">
                      <dt className="text-[var(--muted)]">Size</dt>
                      <dd className="tabular mt-0.5 font-medium">{output.summary.resolution}</dd>
                    </div>
                    <div className="pl-3">
                      <dt className="text-[var(--muted)]">Quality</dt>
                      <dd className="mt-0.5 font-medium">{qualityLabel(recipe.quality)}</dd>
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
                    className="link rounded text-[var(--muted)] hover:text-[var(--text)]"
                    title="Reset every setting to its default (undoable)"
                  >
                    Reset settings
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Mobile-only export bar — keeps Export reachable without scrolling to the sidebar. */}
      {file && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 lg:hidden">
          {/* Same gutters as the page, so on tablets the bar lines up with the content above. */}
          <div className="flex items-center gap-3">
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
