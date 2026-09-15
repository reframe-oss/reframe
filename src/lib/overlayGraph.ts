/**
 * FFmpeg Overlay Filter Graph Generator
 * 
 * Phase 1 MVP: Dynamic filter_complex generation for multi-track compositing
 * Supports up to 2 simultaneous video tracks with scaling, positioning, and opacity.
 * 
 * Example output for 2-track PiP:
 *   [0:v]scale=1920:1080[bg];
 *   [1:v]scale=720:-1[pip];
 *   [bg][pip]overlay=600:400:alpha=linear[outv]
 */

import { TimelineTrack } from "./types";
import { getBackgroundTrack, getOverlayTracks } from "./timeline";

interface OverlayPosition {
  x: number;
  y: number;
}

interface ScaledTrackInfo {
  inputIndex: number;
  track: TimelineTrack;
  width: number;
  height: number;
  position: OverlayPosition;
  opacity: number;
}

/**
 * Determine output position for an overlay
 * If track.position is auto (-1), center the overlay
 */
function resolveOverlayPosition(
  track: TimelineTrack,
  overlayWidth: number,
  overlayHeight: number,
  canvasWidth: number,
  canvasHeight: number
): OverlayPosition {
  let x = track.position.x;
  let y = track.position.y;

  // Auto-center logic
  if (x === -1) {
    x = Math.max(0, (canvasWidth - overlayWidth) / 2);
  }
  if (y === -1) {
    y = Math.max(0, (canvasHeight - overlayHeight) / 2);
  }

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Calculate scaled dimensions maintaining aspect ratio
 * If height is -1, scale based on width proportionally
 */
function calculateScaledDimensions(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number = -1
): { width: number; height: number } {
  if (targetHeight === -1) {
    // Scale width and derive height
    const scale = targetWidth / sourceWidth;
    return {
      width: Math.round(targetWidth),
      height: Math.round(sourceHeight * scale),
    };
  }

  return {
    width: Math.round(targetWidth),
    height: Math.round(targetHeight),
  };
}

/**
 * Build a scale filter spec for a single track
 * Format: [Nin]scale=W:H[Nout]
 */
function buildScaleFilter(
  inputIndex: number,
  width: number,
  height: number,
  labelSuffix: string
): string {
  // Use -2 for height to preserve aspect ratio
  const heightSpec = height === -1 ? "-1" : String(height);
  return `[${inputIndex}:v]scale=${width}:${heightSpec}[${labelSuffix}]`;
}

/**
 * Build an overlay filter spec combining two video streams
 * Format: [base][overlay]overlay=x:y:alpha=linear[out]
 */
function buildOverlayFilter(
  baseLabel: string,
  overlayLabel: string,
  x: number,
  y: number,
  opacityPercent: number,
  outputLabel: string
): string {
  const alpha = opacityPercent < 100 ? `:alpha=linear` : "";
  const alphaStr = opacityPercent < 100
    ? `[${overlayLabel}]format=rgba,colorchannelmixer=aa=${(opacityPercent / 100).toFixed(2)}[${overlayLabel}_a]`
    : "";
  
  const overlayLabelFinal = opacityPercent < 100 ? `${overlayLabel}_a` : overlayLabel;

  if (alphaStr) {
    return [alphaStr, `[${baseLabel}][${overlayLabelFinal}]overlay=${x}:${y}${alpha}[${outputLabel}]`].join(
      "; "
    );
  }

  return `[${baseLabel}][${overlayLabelFinal}]overlay=${x}:${y}${alpha}[${outputLabel}]`;
}

/**
 * Main entry point: Generate FFmpeg filter_complex for multi-track compositing
 * 
 * @param tracks - Timeline tracks sorted by z-index (background first)
 * @param canvasWidth - Output canvas width
 * @param canvasHeight - Output canvas height
 * @returns Filter complex string ready for FFmpeg -filter_complex argument
 */
export function buildOverlayFilterGraph(
  tracks: TimelineTrack[],
  canvasWidth: number,
  canvasHeight: number
): { filterComplex: string; videoOutput: string } {
  // Get background and overlay tracks in proper order
  const bgTrack = getBackgroundTrack(tracks);
  const overlayTracks = getOverlayTracks(tracks);

  // Phase 1 MVP: Only support up to 2 tracks
  if (!bgTrack) {
    // No video tracks; return pass-through
    return { filterComplex: "", videoOutput: "[0:v]" };
  }

  if (overlayTracks.length === 0) {
    // Only background track; scale if needed
    const scaledDims = calculateScaledDimensions(
      1920, // Assume 1920 for now; this should come from metadata
      1080,
      canvasWidth,
      canvasHeight
    );

    const scaleFilter = buildScaleFilter(0, scaledDims.width, scaledDims.height, "bg");
    return { filterComplex: scaleFilter, videoOutput: "[bg]" };
  }

  // 2-track compositing (Background + 1 Overlay)
  const parts: string[] = [];
  let currentOutput = "bg";
  let inputIdx = 0;

  // Scale background to canvas size
  const bgScaled = calculateScaledDimensions(1920, 1080, canvasWidth, canvasHeight);
  parts.push(buildScaleFilter(inputIdx, bgScaled.width, bgScaled.height, currentOutput));
  inputIdx++;

  // Process each overlay track
  overlayTracks.forEach((track, overlayIdx) => {
    const overlayLabel = `overlay${overlayIdx}`;

    // Scale overlay (typically smaller for PiP)
    const overlayWidth = Math.round(canvasWidth * (track.scale || 1.0));
    const overlayHeight = -1; // Preserve aspect ratio
    const overlayScaled = calculateScaledDimensions(
      1920,
      1080,
      overlayWidth,
      overlayHeight
    );

    parts.push(
      buildScaleFilter(inputIdx, overlayScaled.width, overlayScaled.height, overlayLabel)
    );

    // Calculate overlay position (with auto-center if needed)
    const position = resolveOverlayPosition(
      track,
      overlayScaled.width,
      overlayScaled.height,
      canvasWidth,
      canvasHeight
    );

    // Compose overlay onto background/previous output
    const outLabel = overlayIdx === overlayTracks.length - 1 ? "out" : `layer${overlayIdx}`;
    parts.push(
      buildOverlayFilter(
        currentOutput,
        overlayLabel,
        position.x,
        position.y,
        track.opacity ?? 100,
        outLabel
      )
    );

    currentOutput = outLabel;
    inputIdx++;
  });

  const filterComplex = parts.join(";");
  const videoOutput = `[${currentOutput}]`;

  return { filterComplex, videoOutput };
}

/**
 * Validate overlay graph configuration
 * Checks for common issues before passing to FFmpeg
 */
export function validateOverlayGraph(
  tracks: TimelineTrack[],
  canvasWidth: number,
  canvasHeight: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (canvasWidth < 16 || canvasWidth > 7680) {
    errors.push(`Canvas width out of range: ${canvasWidth}`);
  }
  if (canvasHeight < 16 || canvasHeight > 7680) {
    errors.push(`Canvas height out of range: ${canvasHeight}`);
  }

  // Check for more than 2 visible video tracks
  const visibleVideoCount = tracks.filter(
    t => t.visible && t.type === "video" && t.source
  ).length;
  if (visibleVideoCount > 2) {
    errors.push(
      `Phase 1 MVP: Max 2 visible video tracks, found ${visibleVideoCount}`
    );
  }

  // Check track validity
  tracks.forEach((track, idx) => {
    if (!track.id) {
      errors.push(`Track ${idx} missing ID`);
    }
    if (track.opacity < 0 || track.opacity > 100) {
      errors.push(
        `Track ${idx} opacity out of range: ${track.opacity} (expected 0-100)`
      );
    }
    if (track.scale <= 0) {
      errors.push(`Track ${idx} invalid scale: ${track.scale}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Generate example overlay graph for documentation/testing
 */
export function generateExampleOverlayGraphs(): Record<string, string> {
  // Mock a 2-track PiP scenario
  const mockBgTrack: TimelineTrack = {
    id: "bg",
    type: "video",
    source: null,
    startTime: 0,
    duration: 10,
    zIndex: 0,
    visible: true,
    opacity: 100,
    position: { x: 0, y: 0 },
    scale: 1.0,
    rotation: 0,
  };

  const mockPipTrack: TimelineTrack = {
    id: "pip",
    type: "video",
    source: null,
    startTime: 0,
    duration: 5,
    zIndex: 1,
    visible: true,
    opacity: 100,
    position: { x: -1, y: -1 }, // auto-center
    scale: 0.4,
    rotation: 0,
  };

  const { filterComplex } = buildOverlayFilterGraph(
    [mockBgTrack, mockPipTrack],
    1920,
    1080
  );

  return {
    "2-track-pip": filterComplex,
    "example-background-track": mockBgTrack.id,
    "example-overlay-track": mockPipTrack.id,
  };
}
