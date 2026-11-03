/**
 * Tests for Timeline Track Management
 * Phase 1 MVP: Multi-track state operations
 */

import { describe, it, expect } from "vitest";
import {
  generateTrackId,
  createTimelineTrack,
  createMultiTrackState,
  addTrackToTimeline,
  removeTrackFromTimeline,
  updateTrackInTimeline,
  sortTracksByZIndex,
  getVisibleVideoTracks,
  getBackgroundTrack,
  getOverlayTracks,
  validateMultiTrackState,
  serializeMultiTrackState,
} from "@/lib/timeline";
import { TimelineTrack } from "@/lib/types";

describe("Timeline Track Management", () => {
  describe("generateTrackId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateTrackId();
      const id2 = generateTrackId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^track-\d+-[a-z0-9]+$/);
    });
  });

  describe("createTimelineTrack", () => {
    it("should create track with video type and defaults", () => {
      const track = createTimelineTrack("video", null);

      expect(track.type).toBe("video");
      expect(track.source).toBeNull();
      expect(track.startTime).toBe(0);
      expect(track.duration).toBe(0);
      expect(track.zIndex).toBe(0);
      expect(track.visible).toBe(true);
      expect(track.opacity).toBe(100);
      expect(track.scale).toBe(1.0);
      expect(track.rotation).toBe(0);
      expect(track.position).toEqual({ x: -1, y: -1 }); // auto-center
    });

    it("should create track with custom start time", () => {
      const track = createTimelineTrack("video", null, 5);
      expect(track.startTime).toBe(5);
    });

    it("should generate unique ID for each track", () => {
      const track1 = createTimelineTrack("video", null);
      const track2 = createTimelineTrack("video", null);
      expect(track1.id).not.toBe(track2.id);
    });
  });

  describe("createMultiTrackState", () => {
    it("should create initial state with empty tracks", () => {
      const state = createMultiTrackState();

      expect(state.timelineTracks).toEqual([]);
      expect(state.activeTrackId).toBeNull();
      expect(state.maxActiveTracks).toBe(2); // Phase 1 limit
    });
  });

  describe("addTrackToTimeline", () => {
    it("should add track to timeline", () => {
      const state = createMultiTrackState();
      const track = createTimelineTrack("video", null);

      const updated = addTrackToTimeline(state, track);

      expect(updated.timelineTracks).toHaveLength(1);
      expect(updated.timelineTracks[0]).toBe(track);
      expect(updated.activeTrackId).toBe(track.id);
    });

    it("should enforce max 2 video tracks by hiding excess", () => {
      const state = createMultiTrackState();
      const track1 = createTimelineTrack("video", null);
      const track2 = createTimelineTrack("video", null);
      const track3 = createTimelineTrack("video", null);

      const s1 = addTrackToTimeline(state, track1);
      const s2 = addTrackToTimeline(s1, track2);
      const s3 = addTrackToTimeline(s2, track3);

      expect(s3.timelineTracks).toHaveLength(3);
      expect(s3.timelineTracks[0]!.visible).toBe(true);
      expect(s3.timelineTracks[1]!.visible).toBe(true);
      expect(s3.timelineTracks[2]!.visible).toBe(false); // Excess hidden
    });

    it("should allow unlimited image tracks", () => {
      const state = createMultiTrackState();
      const imgTrack1 = createTimelineTrack("image", null);
      const imgTrack2 = createTimelineTrack("image", null);
      const imgTrack3 = createTimelineTrack("image", null);

      const s1 = addTrackToTimeline(state, imgTrack1);
      const s2 = addTrackToTimeline(s1, imgTrack2);
      const s3 = addTrackToTimeline(s2, imgTrack3);

      // All image tracks should remain visible
      expect(s3.timelineTracks.filter(t => t.visible)).toHaveLength(3);
    });
  });

  describe("removeTrackFromTimeline", () => {
    it("should remove track by ID", () => {
      const state = createMultiTrackState();
      const track1 = createTimelineTrack("video", null);
      const track2 = createTimelineTrack("video", null);

      const s1 = addTrackToTimeline(state, track1);
      const s2 = addTrackToTimeline(s1, track2);
      const s3 = removeTrackFromTimeline(s2, track1.id);

      expect(s3.timelineTracks).toHaveLength(1);
      expect(s3.timelineTracks[0]!.id).toBe(track2.id);
    });

    it("should clear activeTrackId if active track is removed", () => {
      const state = createMultiTrackState();
      const track = createTimelineTrack("video", null);

      const s1 = addTrackToTimeline(state, track);
      expect(s1.activeTrackId).toBe(track.id);

      const s2 = removeTrackFromTimeline(s1, track.id);
      expect(s2.activeTrackId).toBeNull();
    });

    it("should reassign activeTrackId to remaining track", () => {
      const state = createMultiTrackState();
      const track1 = createTimelineTrack("video", null);
      const track2 = createTimelineTrack("video", null);

      const s1 = addTrackToTimeline(state, track1);
      const s2 = addTrackToTimeline(s1, track2);
      const s3 = removeTrackFromTimeline(s2, track1.id);

      expect(s3.activeTrackId).toBe(track2.id);
    });
  });

  describe("updateTrackInTimeline", () => {
    it("should update track properties", () => {
      const state = createMultiTrackState();
      const track = createTimelineTrack("video", null);
      const s1 = addTrackToTimeline(state, track);

      const s2 = updateTrackInTimeline(s1, track.id, {
        opacity: 50,
        position: { x: 100, y: 200 },
      });

      expect(s2.timelineTracks[0]!.opacity).toBe(50);
      expect(s2.timelineTracks[0]!.position).toEqual({ x: 100, y: 200 });
    });

    it("should not affect other tracks", () => {
      const state = createMultiTrackState();
      const track1 = createTimelineTrack("video", null);
      const track2 = createTimelineTrack("video", null);

      const s1 = addTrackToTimeline(state, track1);
      const s2 = addTrackToTimeline(s1, track2);
      const s3 = updateTrackInTimeline(s2, track1.id, { opacity: 75 });

      expect(s3.timelineTracks[0]!.opacity).toBe(75);
      expect(s3.timelineTracks[1]!.opacity).toBe(100); // unchanged
    });
  });

  describe("sortTracksByZIndex", () => {
    it("should sort tracks by z-index ascending", () => {
      const track1: TimelineTrack = {
        ...createTimelineTrack("video", null),
        zIndex: 2,
      };
      const track2: TimelineTrack = {
        ...createTimelineTrack("video", null),
        zIndex: 0,
      };
      const track3: TimelineTrack = {
        ...createTimelineTrack("video", null),
        zIndex: 1,
      };

      const sorted = sortTracksByZIndex([track1, track2, track3]);

      expect(sorted[0]!.zIndex).toBe(0);
      expect(sorted[1]!.zIndex).toBe(1);
      expect(sorted[2]!.zIndex).toBe(2);
    });

    it("should not modify original array", () => {
      const tracks = [
        { ...createTimelineTrack("video", null), zIndex: 2 },
        { ...createTimelineTrack("video", null), zIndex: 1 },
      ];

      sortTracksByZIndex(tracks);

      expect(tracks[0]!.zIndex).toBe(2); // original order preserved
    });
  });

  describe("getVisibleVideoTracks", () => {
    it("should return only visible video tracks with source", () => {
      const visible: TimelineTrack = {
        ...createTimelineTrack("video", {} as File),
        visible: true,
      };
      const hidden: TimelineTrack = {
        ...createTimelineTrack("video", {} as File),
        visible: false,
      };
      const noSource: TimelineTrack = {
        ...createTimelineTrack("video", null),
        visible: true,
      };

      const filtered = getVisibleVideoTracks([visible, hidden, noSource]);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.id).toBe(visible.id);
    });

    it("should return sorted by z-index", () => {
      const track1: TimelineTrack = {
        ...createTimelineTrack("video", {} as File),
        zIndex: 1,
        visible: true,
      };
      const track2: TimelineTrack = {
        ...createTimelineTrack("video", {} as File),
        zIndex: 0,
        visible: true,
      };

      const filtered = getVisibleVideoTracks([track1, track2]);

      expect(filtered[0]!.zIndex).toBe(0);
      expect(filtered[1]!.zIndex).toBe(1);
    });
  });

  describe("getBackgroundTrack", () => {
    it("should return lowest z-index visible video", () => {
      const bg: TimelineTrack = {
        ...createTimelineTrack("video", {} as File),
        zIndex: 0,
        visible: true,
      };
      const fg: TimelineTrack = {
        ...createTimelineTrack("video", {} as File),
        zIndex: 1,
        visible: true,
      };

      const track = getBackgroundTrack([bg, fg]);
      expect(track?.id).toBe(bg.id);
    });

    it("should return null if no visible videos", () => {
      const track = getBackgroundTrack([]);
      expect(track).toBeNull();
    });
  });

  describe("getOverlayTracks", () => {
    it("should return all visible videos except background", () => {
      const bg: TimelineTrack = {
        ...createTimelineTrack("video", {} as File),
        zIndex: 0,
        visible: true,
      };
      const overlay1: TimelineTrack = {
        ...createTimelineTrack("video", {} as File),
        zIndex: 1,
        visible: true,
      };
      const overlay2: TimelineTrack = {
        ...createTimelineTrack("video", {} as File),
        zIndex: 2,
        visible: true,
      };

      const overlays = getOverlayTracks([bg, overlay1, overlay2]);
      expect(overlays).toHaveLength(2);
      expect(overlays.every(t => t.id !== bg.id)).toBe(true);
    });
  });

  describe("validateMultiTrackState", () => {
    it("should validate correct state", () => {
      const state = createMultiTrackState();
      const result = validateMultiTrackState(state);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect too many active video tracks", () => {
      let state = createMultiTrackState();
      state = addTrackToTimeline(state, createTimelineTrack("video", {} as File));
      state = addTrackToTimeline(state, createTimelineTrack("video", {} as File));
      const track3 = createTimelineTrack("video", {} as File);
      track3.visible = true; // Force visible to trigger violation
      state.timelineTracks.push(track3);
      state.maxActiveTracks = 2;

      const result = validateMultiTrackState(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Too many"))).toBe(true);
    });

    it("should check for duplicate IDs", () => {
      const state = createMultiTrackState();
      const track1 = createTimelineTrack("video", null);
      const track2 = { ...track1 }; // Duplicate ID

      state.timelineTracks = [track1, track2];

      const result = validateMultiTrackState(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Duplicate"))).toBe(true);
    });

    it("should validate opacity ranges", () => {
      let state = createMultiTrackState();
      const track = createTimelineTrack("video", null);
      track.opacity = 150; // Out of range

      state.timelineTracks = [track];

      const result = validateMultiTrackState(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("opacity"))).toBe(true);
    });
  });

  describe("serializeMultiTrackState", () => {
    it("should remove File objects for serialization", () => {
      let state = createMultiTrackState();
      const track = createTimelineTrack("video", {} as File);
      state = addTrackToTimeline(state, track);

      const serialized = serializeMultiTrackState(state);

      expect(serialized.timelineTracks[0]!.source).toBeNull();
    });

    it("should preserve all other properties", () => {
      let state = createMultiTrackState();
      const track = createTimelineTrack("video", null);
      track.opacity = 75;
      track.position = { x: 100, y: 200 };
      state = addTrackToTimeline(state, track);

      const serialized = serializeMultiTrackState(state);

      expect(serialized.timelineTracks[0]!.opacity).toBe(75);
      expect(serialized.timelineTracks[0]!.position).toEqual({ x: 100, y: 200 });
    });
  });
});
