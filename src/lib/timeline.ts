/**
 * Timeline Track Management Utilities
 * 
 * Phase 1 MVP: Multi-track timeline architecture
 * Provides foundational track operations for the non-linear timeline.
 * Limited to 2 simultaneous video tracks per FFmpeg.wasm memory constraints.
 */

import { TimelineTrack, MultiTrackEditorState } from "./types";

const MAX_TRACKS_PHASE_1 = 2;

/**
 * Generate a unique track ID
 */
export function generateTrackId(): string {
  return `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new timeline track with sensible defaults
 */
export function createTimelineTrack(
  type: "video" | "image",
  source: File | null,
  startTime: number = 0
): TimelineTrack {
  return {
    id: generateTrackId(),
    type,
    source,
    startTime,
    duration: 0, // Will be derived from video metadata
    zIndex: 0,
    visible: true,
    opacity: 100,
    position: {
      x: -1, // auto-center
      y: -1, // auto-center
    },
    scale: 1.0,
    rotation: 0,
  };
}

/**
 * Create initial multi-track editor state
 */
export function createMultiTrackState(): MultiTrackEditorState {
  return {
    timelineTracks: [],
    activeTrackId: null,
    maxActiveTracks: MAX_TRACKS_PHASE_1,
  };
}

/**
 * Add a track to the timeline
 * Returns updated state; enforces max track limit
 */
export function addTrackToTimeline(
  state: MultiTrackEditorState,
  track: TimelineTrack
): MultiTrackEditorState {
  // Phase 1: Only allow 2 active video tracks
  const videoTrackCount = state.timelineTracks.filter(t => t.visible && t.type === "video").length;
  
  if (track.type === "video" && videoTrackCount >= MAX_TRACKS_PHASE_1) {
    track.visible = false;
  }

  return {
    ...state,
    timelineTracks: [...state.timelineTracks, track],
    activeTrackId: track.id,
  };
}

/**
 * Remove a track by ID
 */
export function removeTrackFromTimeline(
  state: MultiTrackEditorState,
  trackId: string
): MultiTrackEditorState {
  const filtered = state.timelineTracks.filter(t => t.id !== trackId);
  return {
    ...state,
    timelineTracks: filtered,
    activeTrackId: state.activeTrackId === trackId ? filtered[0]?.id ?? null : state.activeTrackId,
  };
}

/**
 * Update a track's properties
 */
export function updateTrackInTimeline(
  state: MultiTrackEditorState,
  trackId: string,
  updates: Partial<TimelineTrack>
): MultiTrackEditorState {
  return {
    ...state,
    timelineTracks: state.timelineTracks.map(t =>
      t.id === trackId ? { ...t, ...updates } : t
    ),
  };
}

/**
 * Reorder tracks by z-index (for compositing order)
 * Returns tracks sorted by zIndex ascending (lower index = background)
 */
export function sortTracksByZIndex(tracks: TimelineTrack[]): TimelineTrack[] {
  return [...tracks].sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Get visible video tracks in compositing order
 */
export function getVisibleVideoTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return sortTracksByZIndex(
    tracks.filter(t => t.visible && t.type === "video" && t.source)
  );
}

/**
 * Get the background track (lowest z-index visible video)
 */
export function getBackgroundTrack(tracks: TimelineTrack[]): TimelineTrack | null {
  const visible = getVisibleVideoTracks(tracks);
  return visible.length > 0 ? visible[0]! : null;
}

/**
 * Get overlay tracks (all visible videos except background)
 */
export function getOverlayTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  const visible = getVisibleVideoTracks(tracks);
  return visible.slice(1); // All except first (background)
}

/**
 * Validate multi-track state
 * Ensures consistency and enforces Phase 1 constraints
 */
export function validateMultiTrackState(state: MultiTrackEditorState): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(state.timelineTracks)) {
    errors.push("timelineTracks must be an array");
  }

  const videoTracks = state.timelineTracks.filter(t => t.type === "video");
  const visibleVideoTracks = videoTracks.filter(t => t.visible);

  if (visibleVideoTracks.length > state.maxActiveTracks) {
    errors.push(
      `Too many active video tracks: ${visibleVideoTracks.length} (max: ${state.maxActiveTracks})`
    );
  }

  // Check for duplicate IDs
  const ids = state.timelineTracks.map(t => t.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push("Duplicate track IDs detected");
  }

  // Check z-index validity
  state.timelineTracks.forEach((track, idx) => {
    if (typeof track.zIndex !== "number") {
      errors.push(`Track ${idx} has invalid zIndex`);
    }
    if (track.opacity < 0 || track.opacity > 100) {
      errors.push(`Track ${idx} opacity out of range [0, 100]`);
    }
    if (track.scale <= 0) {
      errors.push(`Track ${idx} scale must be positive`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Compact track representation for serialization
 * Omits File objects which are not serializable
 */
export function serializeMultiTrackState(
  state: MultiTrackEditorState
): Omit<MultiTrackEditorState, "timelineTracks"> & {
  timelineTracks: (Omit<TimelineTrack, "source"> & { source: null })[];
} {
  return {
    ...state,
    timelineTracks: state.timelineTracks.map(t => {
      const { source, ...rest } = t;
      return {
        ...rest,
        source: null,
      };
    }),
  };
}
