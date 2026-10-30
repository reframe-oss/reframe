"use client";

import { useState, useCallback, useEffect, useRef, useMemo, useReducer } from "react";
import {
  EditRecipe,
  ExportResult,
  ExportStatus,
  MAX_FILE_SIZE,
  OverlayPosition,
  TimelineTrack,
  MultiTrackEditorState,
  isValidRecipe,
} from "@/lib/types";
import { createHistory, deepEqual, historyReducer, type EditState } from "@/lib/editHistory";
import {
  DEFAULT_IMAGE_OVERLAY,
  clearProjectRecord,
  createProjectDocument,
  fitEditToDuration,
  loadProjectRecord,
  matchesSource,
  parseProject,
  projectFileName,
  saveProjectRecord,
  serializeProject,
  sourceInfoFromFile,
  toEditState,
  type ProjectDocument,
  type SourceInfo,
} from "@/lib/project";
import { DEFAULT_RECIPE, SPEED_STEPS } from "@/lib/constants";
import { getPresetById } from "@/lib/presets";
import { loadFFmpeg, exportVideo, terminateFFmpeg, FFmpegLoadError } from "@/lib/ffmpeg";
import { trackAction } from "@/lib/telemetry";
import { suggestPreset } from "@/lib/presetSuggestion";
import { validateDimensions, getDownscaledDimensions } from "@/utils/video-validation";
import {
  createMultiTrackState,
  addTrackToTimeline,
  removeTrackFromTimeline,
  updateTrackInTimeline,
  createTimelineTrack,
  validateMultiTrackState,
} from "@/lib/timeline";
import {
  getStoredSoundPreference,
  loadOverlayState,
  loadPersistedRecipe,
  migrateRecipe as migratePersistedRecipe,
  persistOverlayState,
  persistRecipe,
  persistSoundPreference,
  RECIPE_STORAGE_KEY,
  LEGACY_SETTINGS_KEY,
  EDITOR_STATE_KEY,
} from "@/lib/editorPersistence";
import { saveSessionFile, loadSessionFile, clearSessionFile } from "@/lib/sessionDB";

const DEFAULT_TITLE = "Reframe — Resize, trim, and export videos in your browser";
const PROJECT_SAVE_DELAY_MS = 500;

/** A saved project whose source video has to be chosen again. */
export interface PendingRecovery {
  source: SourceInfo;
  /** "imported" when it came from a project file rather than this browser. */
  origin: "session" | "imported";
}

export interface ProjectStorageStatus {
  /** When the edit settings were last written to this browser. */
  savedAt: number | null;
  /** Whether the copy of the source video in IndexedDB is usable after a refresh. */
  sourceCopy: "none" | "saving" | "saved" | "failed";
  error: string | null;
}

export type ProjectImportResult = { ok: true; message: string } | { ok: false; error: string };

const EMPTY_STORAGE_STATUS: ProjectStorageStatus = {
  savedAt: null,
  sourceCopy: "none",
  error: null,
};

function withNewSource(edit: EditState, width: number, height: number): EditState {
  const suggested = suggestPreset(width, height);
  return {
    ...edit,
    recipe: {
      ...edit.recipe,
      trimStart: 0,
      trimEnd: null,
      ...(edit.recipe.preset === DEFAULT_RECIPE.preset ? { preset: suggested } : {}),
    },
  };
}

function clearSavedEditorData() {
  try {
    clearProjectRecord(localStorage);
    localStorage.removeItem(RECIPE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
    localStorage.removeItem(EDITOR_STATE_KEY);
  } catch {
    // ignore
  }
  clearSessionFile().catch(console.error);
}

export function extractMetadata(
  file: File
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "Video metaData load timeout — the file may be too large or the device too slow. Please try again."
        )
      );
    }, 5000);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: isFinite(video.duration) ? video.duration : 0,
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video metadata"));
    };
    video.src = url;
  });
}

function verifyMagicBytes(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = (e) => {
      if (!e.target?.result) {
        resolve(false);
        return;
      }
      const arr = new Uint8Array(e.target.result as ArrayBuffer);
      const hex = Array.from(arr)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      const ascii = String.fromCharCode(...arr);

      // WebM / MKV
      if (hex.startsWith("1A45DFA3")) resolve(true);
      // AVI
      else if (hex.startsWith("52494646") && hex.substring(16, 24) === "41564920") resolve(true);
      // MP4 / MOV (checks for 'ftyp' in first 12 bytes)
      else if (ascii.substring(0, 12).includes("ftyp")) resolve(true);
      else resolve(false);
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, 12));
  });
}

function validateRecipe(recipe: EditRecipe, duration: number): string | null {
  const validations: Array<[boolean, string]> = [
    [recipe.trimStart < 0, "Trim start time cannot be less than 0 seconds."],
    [
      recipe.trimEnd !== null && duration > 0 && recipe.trimEnd > duration,
      `Trim end time cannot exceed the video duration (${Math.floor(duration)}s).`,
    ],
    [
      recipe.trimEnd !== null
        ? recipe.trimStart >= recipe.trimEnd
        : duration > 0 && recipe.trimStart >= duration,
      "Trim start time must be earlier than the end time.",
    ],
    [
      recipe.preset === "custom" &&
        (Number.isNaN(recipe.customWidth) || recipe.customWidth < 16 || recipe.customWidth > 7680),
      "Width must be between 16px and 7680px.",
    ],
    [
      recipe.preset === "custom" &&
        (Number.isNaN(recipe.customHeight) ||
          recipe.customHeight < 16 ||
          recipe.customHeight > 7680),
      "Height must be between 16px and 7680px.",
    ],
    [
      !(SPEED_STEPS as readonly number[]).includes(recipe.speed),
      "Please select a valid playback speed.",
    ],
    [recipe.quality < 18 || recipe.quality > 30, "Quality must be between 18 and 30."],
    [recipe.brightness < -1 || recipe.brightness > 1, "Brightness must be between -1 and 1."],

    [recipe.contrast < 0 || recipe.contrast > 2, "Contrast must be between 0 and 2."],

    [recipe.saturation < 0 || recipe.saturation > 3, "Saturation must be between 0 and 3."],
    [recipe.sharpness < 0 || recipe.sharpness > 3, "Sharpness must be between 0 and 3."],
  ];

  return validations.find(([condition]) => condition)?.[1] ?? null;
}

function encodeRecipe(recipe: EditRecipe): string {
  return encodeURIComponent(JSON.stringify(recipe));
}

function decodeRecipe(encoded: string): Partial<EditRecipe> | null {
  try {
    let jsonString: string;
    try {
      jsonString = decodeURIComponent(encoded);
      if (!jsonString.trim().startsWith("{")) {
        throw new Error();
      }
    } catch {
      jsonString = atob(encoded);
    }
    const decoded = JSON.parse(jsonString);
    if (!decoded || typeof decoded !== "object") return null;
    // Validate the merged recipe before accepting any decoded values.
    // This prevents a tampered or malformed share URL from injecting
    // out-of-range numbers, invalid enum strings, or other unexpected
    // values into the editor state. If any field fails, the whole link
    // is rejected and the editor starts from safe defaults.
    const merged = { ...DEFAULT_RECIPE, ...decoded };
    if (!isValidRecipe(merged)) return null;
    return decoded as Partial<EditRecipe>;
  } catch {
    return null;
  }
}

function isValidValue(key: keyof EditRecipe, val: any): boolean {
  switch (key) {
    case "preset":
      return typeof val === "string";
    case "customWidth":
      return typeof val === "number" && !isNaN(val) && val >= 16 && val <= 7680;
    case "customHeight":
      return typeof val === "number" && !isNaN(val) && val >= 16 && val <= 7680;
    case "framing":
      return val === "fit" || val === "fill";
    case "trimStart":
      return typeof val === "number" && !isNaN(val) && val >= 0;
    case "trimEnd":
      return val === null || (typeof val === "number" && !isNaN(val) && val >= 0);
    case "rotate":
      return val === 0 || val === 90 || val === 180 || val === 270;
    case "speed":
      return (
        typeof val === "number" &&
        !isNaN(val) &&
        [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].includes(val)
      );
    case "quality":
      return typeof val === "number" && !isNaN(val) && val >= 18 && val <= 30;
    case "format":
      return val === "mp4" || val === "webm" || val === "mkv" || val === "gif";
    case "brightness":
      return typeof val === "number" && !isNaN(val) && val >= -1 && val <= 1;
    case "contrast":
      return typeof val === "number" && !isNaN(val) && val >= 0 && val <= 2;
    case "saturation":
      return typeof val === "number" && !isNaN(val) && val >= 0 && val <= 3;
    default:
      return true;
  }
}

export function useVideoEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [videoMetadata, setVideoMetadata] = useState<{
    width: number;
    height: number;
    duration: number;
  } | null>(null);
  // Every user-visible edit lives in one history of immutable snapshots, so
  // the preview, the export and undo/redo all read the same state.
  const [history, dispatchHistory] = useReducer(historyReducer, undefined, () =>
    createHistory(toEditState(DEFAULT_RECIPE))
  );
  const edit = history.present;
  const [soundOnCompletion, setSoundOnCompletion] = useState(DEFAULT_RECIPE.soundOnCompletion);
  const recipe = useMemo<EditRecipe>(
    () => ({ ...edit.recipe, soundOnCompletion }),
    [edit.recipe, soundOnCompletion]
  );
  const [recovery, setRecovery] = useState<PendingRecovery | null>(null);
  const recoveryRef = useRef<PendingRecovery | null>(null);
  const [storageStatus, setStorageStatus] = useState<ProjectStorageStatus>(EMPTY_STORAGE_STATUS);
  const pendingSaveRef = useRef<ProjectDocument | null>(null);
  const userPickedFileRef = useRef(false);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const [exportStartedAt, setExportStartedAt] = useState<number | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const exportCancelledRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState(70);
  const [originalAudioVolume, setOriginalAudioVolume] = useState(40);
  const [loopMusic, setLoopMusic] = useState(false);

  const [overlayFile, setOverlayFile] = useState<File | null>(null);
  const overlayPosition = edit.imageOverlay.position;
  const overlaySize = edit.imageOverlay.size;
  const overlayOpacity = edit.imageOverlay.opacity;
  const [currentTime, setCurrentTime] = useState(0);

  // Phase 1 MVP: Multi-track timeline support
  const [multiTrackState, setMultiTrackState] =
    useState<MultiTrackEditorState>(createMultiTrackState);

  const addTrack = useCallback((track: TimelineTrack) => {
    setMultiTrackState((prev) => addTrackToTimeline(prev, track));
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    setMultiTrackState((prev) => removeTrackFromTimeline(prev, trackId));
  }, []);

  const updateTrack = useCallback((trackId: string, updates: Partial<TimelineTrack>) => {
    setMultiTrackState((prev) => updateTrackInTimeline(prev, trackId, updates));
  }, []);

  const addVideoTrack = useCallback(
    (videoFile: File, startTime: number = 0) => {
      const track = createTimelineTrack("video", videoFile, startTime);
      addTrack(track);
      return track;
    },
    [addTrack]
  );

  const updateEdit = useCallback((update: (prev: EditState) => EditState) => {
    dispatchHistory({ type: "edit", update, now: Date.now() });
  }, []);

  const resetEdit = useCallback((update: (prev: EditState) => EditState) => {
    dispatchHistory({ type: "reset", update });
  }, []);

  const updateRecovery = useCallback((next: PendingRecovery | null) => {
    recoveryRef.current = next;
    setRecovery(next);
  }, []);

  const updateRecipe = useCallback(
    (patch: Partial<EditRecipe>) => {
      const { soundOnCompletion: sound, ...editPatch } = patch;
      // A preference, not an edit: kept out of undo history.
      if (typeof sound === "boolean") setSoundOnCompletion(sound);

      const validated: Partial<EditRecipe> = {};
      for (const [key, val] of Object.entries(editPatch)) {
        if (isValidValue(key as keyof EditRecipe, val)) {
          (validated as any)[key] = val;
        }
      }
      if (Object.keys(validated).length === 0) return;

      updateEdit((prev) => {
        const next = { ...prev.recipe, ...validated };
        // GIF has no audio — force keepAudio off
        if (next.format === "gif") {
          next.keepAudio = false;
        }
        return { ...prev, recipe: next };
      });
    },
    [updateEdit]
  );

  const setOverlayPosition = useCallback(
    (position: OverlayPosition) =>
      updateEdit((prev) => ({ ...prev, imageOverlay: { ...prev.imageOverlay, position } })),
    [updateEdit]
  );
  const setOverlaySize = useCallback(
    (size: number) =>
      updateEdit((prev) => ({ ...prev, imageOverlay: { ...prev.imageOverlay, size } })),
    [updateEdit]
  );
  const setOverlayOpacity = useCallback(
    (opacity: number) =>
      updateEdit((prev) => ({ ...prev, imageOverlay: { ...prev.imageOverlay, opacity } })),
    [updateEdit]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    let saved: ProjectDocument | null = null;
    let baseline: EditState | null = null;
    try {
      saved = loadProjectRecord(localStorage);
      // Genuinely needs an effect: localStorage is a browser-only API.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSoundOnCompletion(getStoredSoundPreference(localStorage));

      const storedOverlay = loadOverlayState(localStorage, {});
      const imageOverlay = saved?.edit.imageOverlay ?? {
        position: storedOverlay.overlayPosition ?? DEFAULT_IMAGE_OVERLAY.position,
        size: storedOverlay.overlaySize ?? DEFAULT_IMAGE_OVERLAY.size,
        opacity: storedOverlay.overlayOpacity ?? DEFAULT_IMAGE_OVERLAY.opacity,
      };

      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("settings");
      const shared = encoded ? decodeRecipe(encoded) : null;
      if (encoded && !shared) {
        const url = new URL(window.location.href);
        url.searchParams.delete("settings");
        window.history.replaceState(null, "", url.toString());
      }

      const recipeKeys = Object.keys(DEFAULT_RECIPE) as Array<keyof EditRecipe>;
      if (shared) {
        // An explicit share link wins over anything saved here.
        baseline = toEditState(migratePersistedRecipe(shared), imageOverlay);
      } else if (saved) {
        // The saved project is the most complete record of the last session;
        // the URL only mirrors the simple recipe fields.
        baseline = saved.edit;
      } else if (recipeKeys.some((key) => params.has(key))) {
        const updatedPatch: Partial<EditRecipe> = {};
        recipeKeys.forEach((key) => {
          const paramVal = params.get(key);
          const defaultType = typeof DEFAULT_RECIPE[key];
          if (paramVal === null || defaultType === "object") return;
          let parsedVal: any;

          if (defaultType === "number") {
            parsedVal = parseFloat(paramVal);
          } else if (defaultType === "boolean") {
            parsedVal = paramVal === "true";
          } else {
            parsedVal = paramVal === "null" ? null : paramVal;
          }

          if (isValidValue(key, parsedVal)) {
            (updatedPatch as any)[key] = parsedVal;
          }
        });
        baseline = toEditState({ ...DEFAULT_RECIPE, ...updatedPatch }, imageOverlay);
      } else {
        baseline = toEditState(
          loadPersistedRecipe(localStorage, migratePersistedRecipe({ ...DEFAULT_RECIPE })),
          imageOverlay
        );
      }
    } catch {
      // Storage unavailable (private mode, blocked site data): start fresh.
    }
    if (baseline) {
      const restored = baseline;
      resetEdit(() => restored);
    }

    // Auto-restore the saved copy of the source video, if there is one.
    const savedSource = saved?.source ?? null;
    const missingSource = () => {
      if (!cancelled && savedSource && !userPickedFileRef.current) {
        updateRecovery({ source: savedSource, origin: "session" });
      }
    };
    loadSessionFile()
      .then(async (savedFile) => {
        if (cancelled || userPickedFileRef.current) return;
        if (!savedFile) return missingSource();
        try {
          const meta = await extractMetadata(savedFile);
          if (cancelled || userPickedFileRef.current) return;
          setDuration(meta.duration);
          setVideoMetadata(meta);
          setFile(savedFile);
          setStorageStatus((prev) => ({ ...prev, sourceCopy: "saved" }));
          if (savedSource && !matchesSource(savedSource, savedFile)) {
            // The stored copy belongs to a different project than the edits.
            resetEdit((prev) => withNewSource(prev, meta.width, meta.height));
          }
        } catch (e) {
          console.error("Failed to restore video session:", e);
          clearSessionFile().catch(console.error);
          missingSource();
        }
      })
      .catch((e) => {
        console.error("Failed to read saved video session:", e);
        missingSource();
      });

    return () => {
      cancelled = true;
    };
  }, [resetEdit, updateRecovery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams();
      const recipeKeys = Object.keys(DEFAULT_RECIPE) as Array<keyof EditRecipe>;

      recipeKeys.forEach((key) => {
        const currentVal = recipe[key];
        const defaultVal = DEFAULT_RECIPE[key];

        // Lists such as textOverlays can't round-trip through a query string.
        if (typeof defaultVal === "object" && defaultVal !== null) return;
        if (currentVal !== defaultVal) {
          params.set(key, currentVal === null ? "null" : String(currentVal));
        }
      });

      const newQuery = params.toString();
      const currentQuery = window.location.search.replace(/^\?/, "");

      if (newQuery !== currentQuery) {
        const newUrl = newQuery
          ? `${window.location.pathname}?${newQuery}`
          : window.location.pathname;
        window.history.replaceState(null, "", newUrl);
      }
    } catch (e) {
      // ignore
    }
  }, [recipe]);

  // Persist the full recipe (debounced)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(() => {
      try {
        // Defaults need no record, and writing one would undo deleteSavedData().
        if (deepEqual(edit.recipe, toEditState(DEFAULT_RECIPE).recipe)) {
          localStorage.removeItem(RECIPE_STORAGE_KEY);
        } else {
          persistRecipe(localStorage, recipe);
        }
      } catch {
        // ignore
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [recipe, edit.recipe]);

  const recommendedPreset = useMemo(() => {
    if (!videoMetadata) return null;
    return getPresetById(suggestPreset(videoMetadata.width, videoMetadata.height)) ?? null;
  }, [videoMetadata]);

  const handleFileSelect = useCallback((selectedFile: File | null) => {
    setResult(null);
    setStatus("idle");
    setError(null);
    setFile(null);
    setVideoMetadata(null);

    if (!selectedFile) {
      setFileError("");
      return;
    }
    userPickedFileRef.current = true;

    if (!selectedFile.type.startsWith("video/")) {
      setFileError("Please upload a video file only.");
      return;
    }

    setFileError("");

    // LAYER 0: Size check
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`Validation Failed: File too large. Maximum size is 2GB.`);
      setStatus("error");
      return;
    }

    const validExtensions = [".mp4", ".mov", ".avi", ".webm", ".mkv"];
    const filename = selectedFile.name.toLowerCase();
    const hasValidExtension = validExtensions.some((ext) => filename.endsWith(ext));
    if (!hasValidExtension) {
      setError(
        `Layer 1 Validation Failed: Invalid file extension. Expected one of: ${validExtensions.join(", ")}`
      );
      setStatus("error");
      return;
    }

    if (!selectedFile.type.startsWith("video/")) {
      setError(
        `Layer 2 Validation Failed: Invalid MIME type. Expected video/*, got ${selectedFile.type || "unknown"}`
      );
      setStatus("error");
      return;
    }

    // Run validation and metadata extraction in background
    (async () => {
      try {
        const isVideo = await verifyMagicBytes(selectedFile);
        if (!isVideo) {
          setError(
            "Layer 3 Validation Failed: Invalid file content. The file's magic bytes do not match known video formats."
          );
          setStatus("error");
          return;
        }

        const { width, height, duration: dur } = await extractMetadata(selectedFile);

        // Layer 5: Resolution check
        const dimensionCheck = validateDimensions(width, height);
        if (dimensionCheck === "blocked") {
          const suggested = getDownscaledDimensions(width, height);
          setError(
            `Layer 5 Validation Failed: Resolution too high (${width}×${height}). ` +
              `Maximum supported is 8K. Suggested safe size: ${suggested.width}×${suggested.height}.`
          );
          setStatus("error");
          return;
        }

        setDuration(dur);
        setVideoMetadata({ width, height, duration: dur });
        setFile(selectedFile);
        setStorageStatus((prev) => ({ ...prev, sourceCopy: "saving" }));
        saveSessionFile(selectedFile)
          .then(() => setStorageStatus((prev) => ({ ...prev, sourceCopy: "saved" })))
          .catch((e) => {
            // Usually a storage quota: edits are still saved, but the video
            // will have to be chosen again after a refresh.
            console.error("Failed to save video session:", e);
            setStorageStatus((prev) => ({ ...prev, sourceCopy: "failed" }));
          });

        if (dimensionCheck === "warning") {
          console.warn(
            `[Reframe] High resolution video detected (${width}×${height}). Export may be slow.`
          );
        }
        // A new source starts a new history. Choosing the file a saved
        // project was made from picks that project back up, trims included.
        const pending = recoveryRef.current;
        if (pending && matchesSource(pending.source, selectedFile)) {
          resetEdit((prev) => fitEditToDuration(prev, dur));
        } else {
          resetEdit((prev) => withNewSource(prev, width, height));
        }
        updateRecovery(null);
      } catch (err) {
        setError(
          `Layer 4 Validation Failed: ${err instanceof Error ? err.message : "Unknown error"}`
        );
        setStatus("error");
      }
    })();
  }, [resetEdit, updateRecovery]);

  const handleExport = useCallback(async () => {
    if (!file) return;
    if (status === "loading-engine" || status === "exporting") {
      return;
    }

    const validationError = validateRecipe(recipe, duration);
    if (validationError) {
      setError(validationError);
      setStatus("error");
      return;
    }

    const abortController = new AbortController();
    exportAbortControllerRef.current = abortController;
    exportCancelledRef.current = false;

    try {
      trackAction("export_start");
      setStatus("loading-engine");
      setProgress(0);
      setError(null);
      setExportStartedAt(null);
      if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
      setResult(null);

      await loadFFmpeg(abortController.signal, setProgress);
      if (exportCancelledRef.current) return;

      const startedAt = Date.now();
      setExportStartedAt(startedAt);
      setStatus("exporting");

      const exportResult = await exportVideo(
        file,
        recipe,
        setProgress,
        abortController.signal,
        {
          file: musicFile,
          musicVolume,
          originalAudioVolume,
          loopMusic,
        },
        {
          file: overlayFile,
          position: overlayPosition,
          size: overlaySize,
          opacity: overlayOpacity,
        }
      );
      if (exportCancelledRef.current) return;

      setResult({
        ...exportResult,
        exportDurationMs: Date.now() - startedAt,
      });
      setStatus("done");
      trackAction("export_success", { durationMs: Date.now() - startedAt });
    } catch (err) {
      if (exportCancelledRef.current) return;
      trackAction("export_failure", { reason: err instanceof Error ? err.name : "unknown" });

      console.error("export failed:", err);
      if (err instanceof FFmpegLoadError) {
        setError(err.message);
      } else if (err instanceof Error && err.message.includes("network")) {
        setError("Network error. Check your internet connection and try again.");
      } else if (err instanceof Error && err.message.includes("codec")) {
        setError("This video format is not supported. Try converting to MP4 first.");
      } else {
        setError("Export failed. Please try again or use a different video.");
      }
      setExportStartedAt(null);
      setStatus("error");
    } finally {
      if (exportAbortControllerRef.current === abortController) {
        exportAbortControllerRef.current = null;
      }
    }
  }, [
    duration,
    file,
    loopMusic,
    musicFile,
    musicVolume,
    originalAudioVolume,
    overlayFile,
    overlayOpacity,
    overlayPosition,
    overlaySize,
    recipe,
    result,
    status,
  ]);

  useEffect(() => {
    if (status === "exporting") {
      document.title = `Exporting ${progress}% | Reframe`;
    } else if (status === "loading-engine") {
      document.title = `Loading engine... | Reframe`;
    } else if (status === "done") {
      document.title = `Export complete | Reframe`;
    } else if (file) {
      document.title = `Editing: ${file.name} | Reframe`;
    } else {
      document.title = DEFAULT_TITLE;
    }
  }, [status, progress, file]);

  useEffect(() => {
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  useEffect(() => {
    const shouldWarn = status === "exporting" || status === "loading-engine";

    if (!shouldWarn) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "Enter" &&
        file &&
        status !== "loading-engine" &&
        status !== "exporting"
      ) {
        handleExport();
      }
    };

    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [file, status, handleExport]);

  // M key: toggle audio mute — only when a file is loaded and focus isn't in a text field
  useEffect(() => {
    if (!file) return;

    const handleMuteShortcut = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      updateEdit((prev) => ({ ...prev, recipe: { ...prev.recipe, keepAudio: !prev.recipe.keepAudio } }));
    };

    document.addEventListener("keydown", handleMuteShortcut);
    return () => {
      document.removeEventListener("keydown", handleMuteShortcut);
    };
  }, [file, updateEdit]);

  useEffect(() => {
    return () => {
      if (result?.blobUrl) {
        URL.revokeObjectURL(result.blobUrl);
      }
    };
  }, [result?.blobUrl]);

  useEffect(() => {
    return () => {
      terminateFFmpeg();
    };
  }, []);

  // Resets the edit settings as one undoable step. Saved data is left alone;
  // deleteSavedData() is the explicit way to remove it.
  const resetSettings = useCallback(() => {
    updateEdit((prev) => toEditState(DEFAULT_RECIPE, prev.imageOverlay));
  }, [updateEdit]);

  const cancelExport = useCallback(() => {
    exportCancelledRef.current = true;
    exportAbortControllerRef.current?.abort();
    exportAbortControllerRef.current = null;
    terminateFFmpeg();
    setStatus("idle");
    setProgress(0);
    setError(null);
    setExportStartedAt(null);
  }, []);

  const reset = useCallback(() => {
    if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
    setFile(null);
    setVideoMetadata(null);
    setDuration(0);
    resetEdit((prev) => toEditState(DEFAULT_RECIPE, prev.imageOverlay));
    setStatus("idle");
    setProgress(0);
    setResult(null);
    setError(null);
    setExportStartedAt(null);
    pendingSaveRef.current = null;
    updateRecovery(null);
    setStorageStatus(EMPTY_STORAGE_STATUS);
    try {
      clearProjectRecord(localStorage);
      localStorage.removeItem(RECIPE_STORAGE_KEY);
      localStorage.removeItem(LEGACY_SETTINGS_KEY);
      clearSessionFile().catch(console.error);
    } catch {
      // ignore
    }
  }, [result, resetEdit, updateRecovery]);

  /** Removes everything this editor saved in the browser and starts over. */
  const deleteSavedData = useCallback(() => {
    if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
    pendingSaveRef.current = null;
    clearSavedEditorData();
    setFile(null);
    setVideoMetadata(null);
    setDuration(0);
    setResult(null);
    setStatus("idle");
    setProgress(0);
    setError(null);
    setExportStartedAt(null);
    setOverlayFile(null);
    resetEdit(() => toEditState(DEFAULT_RECIPE));
    updateRecovery(null);
    setStorageStatus(EMPTY_STORAGE_STATUS);
  }, [result, resetEdit, updateRecovery]);

  const isBusy = status === "loading-engine" || status === "exporting";
  const canUndo = history.past.length > 0 && !isBusy;
  const canRedo = history.future.length > 0 && !isBusy;
  // Undo is blocked mid-export: the running export has already captured its
  // settings, and the result has to match what the controls showed.
  const undoEdit = useCallback(() => {
    if (!isBusy) dispatchHistory({ type: "undo" });
  }, [isBusy]);
  const redoEdit = useCallback(() => {
    if (!isBusy) dispatchHistory({ type: "redo" });
  }, [isBusy]);

  const currentSource = useMemo(
    () => (file && videoMetadata ? sourceInfoFromFile(file, videoMetadata) : null),
    [file, videoMetadata]
  );

  // Persist the project (edits + source description) while a video is open.
  const flushProjectSave = useCallback(() => {
    const doc = pendingSaveRef.current;
    if (!doc) return;
    pendingSaveRef.current = null;
    let ok = false;
    try {
      ok = saveProjectRecord(localStorage, doc);
    } catch {
      ok = false;
    }
    setStorageStatus((prev) =>
      ok
        ? { ...prev, savedAt: Date.parse(doc.savedAt), error: null }
        : { ...prev, error: "Couldn't save your edits in this browser. Use “Save project file” to keep them." }
    );
  }, []);

  useEffect(() => {
    if (!currentSource) return;
    pendingSaveRef.current = createProjectDocument(edit, currentSource, new Date());
    const timer = setTimeout(flushProjectSave, PROJECT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [edit, currentSource, flushProjectSave]);

  useEffect(() => {
    if (!currentSource) return;
    try {
      persistOverlayState(localStorage, {
        overlayPosition: edit.imageOverlay.position,
        overlaySize: edit.imageOverlay.size,
        overlayOpacity: edit.imageOverlay.opacity,
      });
    } catch {
      // ignore
    }
  }, [edit.imageOverlay, currentSource]);

  // A refresh or closed tab inside the debounce window must not lose the edit.
  useEffect(() => {
    window.addEventListener("pagehide", flushProjectSave);
    return () => {
      window.removeEventListener("pagehide", flushProjectSave);
      flushProjectSave();
    };
  }, [flushProjectSave]);

  /** The current project as a JSON file. Media is never included. */
  const buildProjectFile = useCallback(() => {
    const source = currentSource ?? recoveryRef.current?.source ?? null;
    const doc = createProjectDocument(edit, source, new Date());
    return { fileName: projectFileName(source), contents: serializeProject(doc) };
  }, [currentSource, edit]);

  const importProjectFile = useCallback(
    (contents: string): ProjectImportResult => {
      if (isBusy) return { ok: false, error: "Wait for the export to finish before opening a project." };
      const parsed = parseProject(contents);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const { project } = parsed;

      if (!currentSource) {
        // Nothing open yet: hold the edits until the matching video is chosen.
        resetEdit(() => project.edit);
        if (project.source) updateRecovery({ source: project.source, origin: "imported" });
        return {
          ok: true,
          message: project.source
            ? `Project opened. Choose “${project.source.name}” to continue editing it.`
            : "Project opened. Choose a video to apply its edits to.",
        };
      }

      // Undoable, so opening the wrong file is one Cmd/Ctrl+Z away.
      updateEdit(() => fitEditToDuration(project.edit, currentSource.duration));
      updateRecovery(null);
      if (project.source && !matchesSource(project.source, currentSource)) {
        return {
          ok: true,
          message: `Edits applied. This project was made for “${project.source.name}”, so check the trim points.`,
        };
      }
      return { ok: true, message: "Project opened and applied to this video." };
    },
    [currentSource, isBusy, resetEdit, updateEdit, updateRecovery]
  );

  /** Forgets a saved project whose video can't be found, keeping nothing. */
  const discardRecovery = useCallback(() => {
    try {
      clearProjectRecord(localStorage);
    } catch {
      // ignore
    }
    resetEdit(() => toEditState(DEFAULT_RECIPE));
    updateRecovery(null);
  }, [resetEdit, updateRecovery]);

  useEffect(() => {
    try {
      persistSoundPreference(localStorage, soundOnCompletion);
    } catch {
      // ignore
    }
  }, [soundOnCompletion]);
  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  });

  const toggleSound = useCallback(() => {
    setSoundOnCompletion((prev) => !prev);
  }, []);

  return {
    file,
    duration,
    recipe,
    status,
    progress,
    exportStartedAt,
    result,
    error,
    videoRef,
    seekTo,
    updateRecipe,
    handleFileSelect,
    fileError,
    handleExport,
    cancelExport,
    reset,
    resetSettings,
    undo: undoEdit,
    redo: redoEdit,
    canUndo,
    canRedo,
    recovery,
    discardRecovery,
    storageStatus,
    buildProjectFile,
    importProjectFile,
    deleteSavedData,
    musicFile,
    setMusicFile,
    musicVolume,
    setMusicVolume,
    originalAudioVolume,
    setOriginalAudioVolume,
    loopMusic,
    setLoopMusic,
    overlayFile,
    setOverlayFile,
    overlayPosition,
    setOverlayPosition,
    overlaySize,
    setOverlaySize,
    overlayOpacity,
    setOverlayOpacity,
    recommendedPreset,
    currentTime,
    toggleSound,
    // Phase 1 MVP: Multi-track timeline support
    multiTrackState,
    addTrack,
    removeTrack,
    updateTrack,
    addVideoTrack,
  };
}
