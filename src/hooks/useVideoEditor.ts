"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { EditRecipe, ExportResult, ExportStatus, MAX_FILE_SIZE, OverlayPosition, TimelineTrack, MultiTrackEditorState, isValidRecipe } from "@/lib/types";
import { DEFAULT_RECIPE, SPEED_STEPS } from "@/lib/constants";
import { getPresetById } from "@/lib/presets";
import { loadFFmpeg, exportVideo, terminateFFmpeg, FFmpegLoadError } from "@/lib/ffmpeg";
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
  loadPersistedRecipe,
  migrateRecipe as migratePersistedRecipe,
  persistRecipe,
  persistSoundPreference,
  RECIPE_STORAGE_KEY,
  LEGACY_SETTINGS_KEY,
} from "@/lib/editorPersistence";
import { saveSessionFile, loadSessionFile, clearSessionFile } from "@/lib/sessionDB";

const DEFAULT_TITLE = "Reframe — Resize, trim, and export videos in your browser";

export function extractMetadata(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject( new Error("Video metaData load timeout — the file may be too large or the device too slow. Please try again.") );
    }, 5000);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timeout)
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: isFinite(video.duration) ? video.duration : 0,
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      clearTimeout(timeout)
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
      const hex = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
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

function validateRecipe(recipe: EditRecipe, duration: number ): string | null {
  const validations: Array<[boolean, string]> = [
    [
      recipe.trimStart < 0,
      "Trim start time cannot be less than 0 seconds.",
    ],
    [
      recipe.trimEnd !== null && duration > 0 && recipe.trimEnd > duration,
      `Trim end time cannot exceed the video duration (${Math.floor(duration)}s).`,
    ],
    [
      recipe.trimEnd !== null 
        ? recipe.trimStart >= recipe.trimEnd 
        : (duration > 0 && recipe.trimStart >= duration),
      "Trim start time must be earlier than the end time.",
    ],
    [
      recipe.preset === "custom" && (Number.isNaN(recipe.customWidth) || recipe.customWidth < 16 || recipe.customWidth > 7680),
      "Width must be between 16px and 7680px.",
    ],
    [
      recipe.preset === "custom" && (Number.isNaN(recipe.customHeight) || recipe.customHeight < 16 || recipe.customHeight > 7680),
      "Height must be between 16px and 7680px.",
    ],
    [
      !(SPEED_STEPS as readonly number[]).includes(recipe.speed),
      "Please select a valid playback speed.",
    ],
    [
      recipe.quality < 18 || recipe.quality > 30,
      "Quality must be between 18 and 30.",
    ],
    [
      recipe.brightness < -1 || recipe.brightness > 1,
      "Brightness must be between -1 and 1.",
    ],

    [
      recipe.contrast < 0 || recipe.contrast > 2,
      "Contrast must be between 0 and 2.",
    ],

    [
      recipe.saturation < 0 || recipe.saturation > 3,
      "Saturation must be between 0 and 3.",
    ],
    [
      recipe.sharpness < 0 || recipe.sharpness > 3,
      "Sharpness must be between 0 and 3.",
    ],
  ];

  return (
    validations.find(([condition]) => condition)?.[1] ??
    null
  );
}

function encodeRecipe(recipe: EditRecipe): string {
  return btoa(JSON.stringify(recipe));
}

function decodeRecipe(encoded: string): Partial<EditRecipe> | null {
  try {
    const decoded = JSON.parse(atob(encoded));
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

export function useVideoEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [videoMetadata, setVideoMetadata] = useState<{
    width: number;
    height: number;
    duration: number;
  } | null>(null);
  const [recipe, setRecipe] = useState<EditRecipe>({ ...DEFAULT_RECIPE });
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
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>("bottom-right");
  const [overlaySize, setOverlaySize] = useState(150);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [currentTime, setCurrentTime] = useState(0);

  // Phase 1 MVP: Multi-track timeline support
  const [multiTrackState, setMultiTrackState] = useState<MultiTrackEditorState>(createMultiTrackState);

  const addTrack = useCallback((track: TimelineTrack) => {
    setMultiTrackState(prev => addTrackToTimeline(prev, track));
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    setMultiTrackState(prev => removeTrackFromTimeline(prev, trackId));
  }, []);

  const updateTrack = useCallback((trackId: string, updates: Partial<TimelineTrack>) => {
    setMultiTrackState(prev => updateTrackInTimeline(prev, trackId, updates));
  }, []);

  const addVideoTrack = useCallback((videoFile: File, startTime: number = 0) => {
    const track = createTimelineTrack("video", videoFile, startTime);
    addTrack(track);
    return track;
  }, [addTrack]);

  const updateRecipe = useCallback((patch: Partial<EditRecipe>) => {
  setRecipe((prev) => {
    const next = { ...prev, ...patch };
    // GIF has no audio — force keepAudio off
    if (next.format === "gif") {
      next.keepAudio = false;
    }
    return next;
  });
}, []);
  const isValidValue = (key: keyof EditRecipe, val: any): boolean => {
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
        return typeof val === "number" && !isNaN(val) && [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].includes(val);
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
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Auto-restore saved video session
    loadSessionFile().then(async (savedFile) => {
      if (savedFile) {
        try {
          const { width, height, duration: dur } = await extractMetadata(savedFile);
          setDuration(dur);
          setVideoMetadata({ width, height, duration: dur });
          setFile(savedFile);
        } catch (e) {
          console.error("Failed to restore video session:", e);
          clearSessionFile().catch(console.error);
        }
      }
    }).catch(console.error);

    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("settings");
      if (encoded) {
        const decoded = decodeRecipe(encoded);
        if (decoded) {
          setRecipe(migratePersistedRecipe(decoded));
          return;
        }
      }

      const recipeKeys = Object.keys(DEFAULT_RECIPE) as Array<keyof EditRecipe>;
      const hasRecipeParams = recipeKeys.some(key => params.has(key));

      if (hasRecipeParams) {
        const updatedPatch: Partial<EditRecipe> = {};
        recipeKeys.forEach((key) => {
          const paramVal = params.get(key);
          if (paramVal !== null) {
            const defaultType = typeof DEFAULT_RECIPE[key];
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
          }
        });

        if (Object.keys(updatedPatch).length > 0) {
          setRecipe(prev => ({
            ...prev,
            ...updatedPatch
          }));
        }
      } else {
        setRecipe((current) => loadPersistedRecipe(localStorage, migratePersistedRecipe({
          ...current,
          soundOnCompletion: getStoredSoundPreference(localStorage),
        })));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams();
      const recipeKeys = Object.keys(DEFAULT_RECIPE) as Array<keyof EditRecipe>;

      recipeKeys.forEach((key) => {
        if (key === "textOverlays") return;
        const currentVal = recipe[key];
        const defaultVal = DEFAULT_RECIPE[key];

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
        persistRecipe(localStorage, recipe);
      } catch {
        // ignore
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [recipe]);

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

    const validExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    const filename = selectedFile.name.toLowerCase();
    const hasValidExtension = validExtensions.some(ext => filename.endsWith(ext));
    if (!hasValidExtension) {
      setError(`Layer 1 Validation Failed: Invalid file extension. Expected one of: ${validExtensions.join(', ')}`);
      setStatus("error");
      return;
    }

    if (!selectedFile.type.startsWith("video/")) {
      setError(`Layer 2 Validation Failed: Invalid MIME type. Expected video/*, got ${selectedFile.type || 'unknown'}`);
      setStatus("error");
      return;
    }

    // Run validation and metadata extraction in background
    (async () => {
      try {
        const isVideo = await verifyMagicBytes(selectedFile);
        if (!isVideo) {
          setError("Layer 3 Validation Failed: Invalid file content. The file's magic bytes do not match known video formats.");
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
        saveSessionFile(selectedFile).catch(console.error);

        if (dimensionCheck === "warning") {
          console.warn(`[Reframe] High resolution video detected (${width}×${height}). Export may be slow.`);
        }
        setRecipe((prev) => {
          const suggestedPreset = suggestPreset(width, height);
          const shouldApplySuggestion = prev.preset === DEFAULT_RECIPE.preset;

          return {
            ...prev,
            trimStart: 0,
            trimEnd: null,
            ...(shouldApplySuggestion ? { preset: suggestedPreset } : {}),
          };
        });
      } catch (err) {
        setError(`Layer 4 Validation Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        setStatus("error");
      }
    })();

  }, []);

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
     }  catch (err) {
      if (exportCancelledRef.current) return;

      console.error("export failed:", err);
      if (err instanceof FFmpegLoadError) {
        setError(err.message);
      } else if (err instanceof Error && err.message.includes('network')) {
        setError('Network error. Check your internet connection and try again.');
      } else if (err instanceof Error && err.message.includes('codec')) {
        setError('This video format is not supported. Try converting to MP4 first.');
      } else {
        setError('Export failed. Please try again or use a different video.');
      }
      setExportStartedAt(null);
      setStatus("error");
    }
    finally {
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
    const shouldWarn =
      status === "exporting" ||
      status === "loading-engine";

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
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      setRecipe((prev) => ({ ...prev, keepAudio: !prev.keepAudio }));
    };

    document.addEventListener("keydown", handleMuteShortcut);
    return () => {
      document.removeEventListener("keydown", handleMuteShortcut);
    };
  }, [file]);

  useEffect(()=>{
    return ()=>{
      if(result?.blobUrl){
        URL.revokeObjectURL(result.blobUrl);
      }
    }
   },[result?.blobUrl])

  useEffect(() => {
    return () => {
      terminateFFmpeg();
    };
  }, []);

  const resetSettings = useCallback(() => {
    setRecipe(DEFAULT_RECIPE);
    try {
      localStorage.removeItem(RECIPE_STORAGE_KEY);
      localStorage.removeItem(LEGACY_SETTINGS_KEY);
      clearSessionFile().catch(console.error);
    } catch {
      // ignore
    }
  }, []);

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
    setRecipe(DEFAULT_RECIPE);
    setStatus("idle");
    setProgress(0);
    setResult(null);
    setError(null);
    setExportStartedAt(null);
    try {
      localStorage.removeItem(RECIPE_STORAGE_KEY);
      localStorage.removeItem(LEGACY_SETTINGS_KEY);
      clearSessionFile().catch(console.error);
    } catch {
      // ignore
    }
  }, [result]);


  useEffect(() => {
    persistSoundPreference(localStorage, recipe.soundOnCompletion);
  }, [recipe.soundOnCompletion]);
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
  updateRecipe({ soundOnCompletion: !recipe.soundOnCompletion });
}, [recipe.soundOnCompletion, updateRecipe]);

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
