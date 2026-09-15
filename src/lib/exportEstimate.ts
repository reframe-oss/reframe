import { EditRecipe } from "./types";

// ---------------------------------------------------------------------------
// Preset dimension map
// Keep in sync with src/lib/presets.ts. Width × height for every named preset.
// ---------------------------------------------------------------------------
const PRESET_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "landscape-16-9":      { width: 1920, height: 1080 },
  "twitter-hd":          { width: 1280, height: 720  },
  "vertical-9-16":       { width: 1080, height: 1920 },
  "instagram-4-5":       { width: 1080, height: 1350 },
  "square-1-1":          { width: 1080, height: 1080 },
  "ultrawide-21-9":      { width: 2560, height: 1080 },
  "instagram-panoramic": { width: 5120, height: 1080 },
  "portrait-3-4":        { width: 1080, height: 1440 },
  "cinema-scope":        { width: 2048, height: 858  },
  "dci-2k":              { width: 2048, height: 1080 },
};

/**
 * Resolve the actual output pixel dimensions for a recipe.
 * When a named preset is active we look it up; otherwise we use
 * the custom width/height the user typed in.
 */
function getOutputDimensions(recipe: EditRecipe): { width: number; height: number } {
  if (recipe.preset !== "custom") {
    const dims = PRESET_DIMENSIONS[recipe.preset];
    if (dims) return dims;
  }
  return { 
    width: recipe.customWidth || 1920, 
    height: recipe.customHeight || 1080 
  };
}

// ---------------------------------------------------------------------------
// CRF → video bitrate (Mbps) — exponential fit to real-world H.264 data
// ---------------------------------------------------------------------------
const CRF_A = 8 * Math.exp(0.2185 * 18); // ≈ 383
const CRF_K = 0.2185;

function videoBitrateFromCrf(crf: number): number {
  return CRF_A * Math.exp(-CRF_K * crf); // Mbps at 1080p
}

// ---------------------------------------------------------------------------
// Resolution multiplier relative to 1080p (pixel-count ratio, sqrt-damped)
// ---------------------------------------------------------------------------
function resolutionMultiplier(width: number, height: number): number {
  const pixels = width * height;
  const refPixels = 1920 * 1080;
  const ratio = pixels / refPixels;
  return Math.max(Math.sqrt(ratio), 0.1);
}

// ---------------------------------------------------------------------------
// Format overhead factor
// MP4 and MKV are close; WebM (VP9) tends to produce slightly smaller files
// at the same CRF, so we apply a small discount.
// ---------------------------------------------------------------------------
function formatFactor(format: string | undefined): number {
  switch (format) {
    case "webm": return 0.85;
    case "mkv":  return 1.02;
    case "mp4":
    default:     return 1.0;
  }
}

// ---------------------------------------------------------------------------
// Audio bitrate estimate (Mbps)
// AAC 128 kbps for stereo — independent of video quality settings.
// ---------------------------------------------------------------------------
const AUDIO_BITRATE_MBPS = 0.128;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Estimate the output file size in **megabytes**.
 *
 * @param recipe   The current EditRecipe (preset, quality, speed, trim, format…)
 * @param duration Source video duration in seconds (used when trimEnd is null)
 * @returns        Estimated size in MB (floating-point)
 */
export function estimateExportSize(recipe: EditRecipe, duration: number): number {
  // 1. Effective playback duration after trimming
  const trimEnd = recipe.trimEnd ?? duration;
  const trimmedDuration = Math.max(trimEnd - recipe.trimStart, 1); // seconds

  // 2. Speed affects wall-clock output length
  const outputDuration = trimmedDuration / Math.max(recipe.speed, 0.25);

  // 3. Resolve pixel dimensions from preset or custom fields safely
  const { width, height } = getOutputDimensions(recipe);

  // 4. Handle high-quality adaptive GIF estimation separately
  if (recipe.format === "gif") {
    const GIF_FPS = 15;
    
    // Set base compression scaling factor for maximum quality (CRF 18)
    const BASE_COMPRESSION = 0.85;
    
    // Linearly reduce compression ratio as CRF slider increases toward 30
    const qualityLossModifier = (recipe.quality - 18) * 0.035;
    const effectiveCompression = Math.max(BASE_COMPRESSION - qualityLossModifier, 0.35);

    const frames = outputDuration * GIF_FPS;
    
    // Uncompressed raw/palette-mapped payload calculation (size in MB)
    return (width * height * frames * effectiveCompression) / (1024 * 1024);
  }

  // 5. Standard Video bitrate at the target resolution (Mbps)
  const videoBitrate =
    videoBitrateFromCrf(recipe.quality) *
    resolutionMultiplier(width, height) *
    formatFactor(recipe.format);

  // 6. Total bitrate = video + audio (only if keepAudio is checked)
  const totalBitrate = videoBitrate + (recipe.keepAudio ? AUDIO_BITRATE_MBPS : 0);

  // 7. Size in megabytes (Mbps × seconds / 8 = megabytes)
  return (totalBitrate * outputDuration) / 8;
}

/**
 * Format a megabyte value into a human-readable approximate string.
 * Examples: "~320 KB", "~4.2 MB", "~1.3 GB"
 */
export function formatEstimatedSize(sizeMb: number): string {
  if (sizeMb >= 1024) {
    return `~${(sizeMb / 1024).toFixed(1)} GB`;
  }
  if (sizeMb < 1) {
    return `~${Math.round(sizeMb * 1024)} KB`;
  }
  return `~${sizeMb.toFixed(1)} MB`;
}