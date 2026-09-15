/**
 * Tests for FFmpeg Overlay Graph Generation
 * Phase 1 MVP: Multi-track filter_complex generation
 */

import { describe, it, expect } from "vitest";
import {
  buildOverlayFilterGraph,
  validateOverlayGraph,
  generateExampleOverlayGraphs,
} from "@/lib/overlayGraph";
import { TimelineTrack } from "@/lib/types";

describe("buildOverlayFilterGraph", () => {
  it("should return pass-through for empty track list", () => {
    const { filterComplex, videoOutput } = buildOverlayFilterGraph([], 1920, 1080);
    expect(videoOutput).toBe("[0:v]");
  });

  it("should return pass-through for single track with no source", () => {
    const track: TimelineTrack = {
      id: "test",
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

    const { filterComplex, videoOutput } = buildOverlayFilterGraph([track], 1920, 1080);
    expect(videoOutput).toBe("[0:v]");
  });

  it("should scale background track to canvas dimensions", () => {
    const bgTrack: TimelineTrack = {
      id: "bg",
      type: "video",
      source: {} as File,
      startTime: 0,
      duration: 10,
      zIndex: 0,
      visible: true,
      opacity: 100,
      position: { x: 0, y: 0 },
      scale: 1.0,
      rotation: 0,
    };

    const { filterComplex } = buildOverlayFilterGraph([bgTrack], 1920, 1080);
    expect(filterComplex).toContain("[0:v]scale=1920:1080[bg]");
  });

  it("should compose two video tracks with PiP positioning", () => {
    const bgTrack: TimelineTrack = {
      id: "bg",
      type: "video",
      source: {} as File,
      startTime: 0,
      duration: 10,
      zIndex: 0,
      visible: true,
      opacity: 100,
      position: { x: 0, y: 0 },
      scale: 1.0,
      rotation: 0,
    };

    const pipTrack: TimelineTrack = {
      id: "pip",
      type: "video",
      source: {} as File,
      startTime: 0,
      duration: 5,
      zIndex: 1,
      visible: true,
      opacity: 100,
      position: { x: 50, y: 50 }, // Manual positioning
      scale: 0.4,
      rotation: 0,
    };

    const { filterComplex, videoOutput } = buildOverlayFilterGraph(
      [bgTrack, pipTrack],
      1920,
      1080
    );

    expect(filterComplex).toContain("[0:v]scale=1920:1080[bg]");
    // Scale: 0.4 * 1920 = 768, height scales proportionally: 768 * (1080/1920) = 432
    expect(filterComplex).toContain("[1:v]scale=768:432[overlay0]");
    expect(filterComplex).toContain("[bg][overlay0]overlay=50:50");
    expect(videoOutput).toBe("[out]");
  });

  it("should apply opacity to overlay tracks", () => {
    const bgTrack: TimelineTrack = {
      id: "bg",
      type: "video",
      source: {} as File,
      startTime: 0,
      duration: 10,
      zIndex: 0,
      visible: true,
      opacity: 100,
      position: { x: 0, y: 0 },
      scale: 1.0,
      rotation: 0,
    };

    const pipTrack: TimelineTrack = {
      id: "pip",
      type: "video",
      source: {} as File,
      startTime: 0,
      duration: 5,
      zIndex: 1,
      visible: true,
      opacity: 50, // 50% opacity
      position: { x: -1, y: -1 }, // auto-center
      scale: 0.4,
      rotation: 0,
    };

    const { filterComplex } = buildOverlayFilterGraph(
      [bgTrack, pipTrack],
      1920,
      1080
    );

    // Should include opacity/alpha handling
    expect(filterComplex).toContain("colorchannelmixer");
    expect(filterComplex).toContain("0.50"); // 50% = 0.50
  });

  it("should auto-center overlay when position is -1", () => {
    const bgTrack: TimelineTrack = {
      id: "bg",
      type: "video",
      source: {} as File,
      startTime: 0,
      duration: 10,
      zIndex: 0,
      visible: true,
      opacity: 100,
      position: { x: 0, y: 0 },
      scale: 1.0,
      rotation: 0,
    };

    const pipTrack: TimelineTrack = {
      id: "pip",
      type: "video",
      source: {} as File,
      startTime: 0,
      duration: 5,
      zIndex: 1,
      visible: true,
      opacity: 100,
      position: { x: -1, y: -1 }, // auto-center
      scale: 0.3,
      rotation: 0,
    };

    const { filterComplex } = buildOverlayFilterGraph(
      [bgTrack, pipTrack],
      1920,
      1080
    );

    // Scale: 0.3 * 1920 = 576
    // Center X: (1920 - 576) / 2 = 672
    // Center Y: (1080 - scaled_height) / 2
    expect(filterComplex).toContain("overlay=672:");
  });

  it("should hide invisible tracks", () => {
    const bgTrack: TimelineTrack = {
      id: "bg",
      type: "video",
      source: {} as File,
      startTime: 0,
      duration: 10,
      zIndex: 0,
      visible: true,
      opacity: 100,
      position: { x: 0, y: 0 },
      scale: 1.0,
      rotation: 0,
    };

    const hiddenTrack: TimelineTrack = {
      id: "hidden",
      type: "video",
      source: {} as File,
      startTime: 0,
      duration: 5,
      zIndex: 1,
      visible: false, // Hidden
      opacity: 100,
      position: { x: 50, y: 50 },
      scale: 0.4,
      rotation: 0,
    };

    const { filterComplex, videoOutput } = buildOverlayFilterGraph(
      [bgTrack, hiddenTrack],
      1920,
      1080
    );

    // Hidden track should not be in filter
    expect(filterComplex).not.toContain("hidden");
    expect(videoOutput).toBe("[bg]");
  });
});

describe("validateOverlayGraph", () => {
  it("should validate correct graph configuration", () => {
    const tracks: TimelineTrack[] = [
      {
        id: "bg",
        type: "video",
        source: {} as File,
        startTime: 0,
        duration: 10,
        zIndex: 0,
        visible: true,
        opacity: 100,
        position: { x: 0, y: 0 },
        scale: 1.0,
        rotation: 0,
      },
    ];

    const result = validateOverlayGraph(tracks, 1920, 1080);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject invalid canvas dimensions", () => {
    const tracks: TimelineTrack[] = [];

    const result = validateOverlayGraph(tracks, 10, 1080); // Width too small
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Canvas width"))).toBe(true);
  });

  it("should enforce max 2 video tracks limit", () => {
    const tracks: TimelineTrack[] = [
      {
        id: "1",
        type: "video",
        source: {} as File,
        startTime: 0,
        duration: 10,
        zIndex: 0,
        visible: true,
        opacity: 100,
        position: { x: 0, y: 0 },
        scale: 1.0,
        rotation: 0,
      },
      {
        id: "2",
        type: "video",
        source: {} as File,
        startTime: 0,
        duration: 10,
        zIndex: 1,
        visible: true,
        opacity: 100,
        position: { x: 0, y: 0 },
        scale: 1.0,
        rotation: 0,
      },
      {
        id: "3",
        type: "video",
        source: {} as File,
        startTime: 0,
        duration: 10,
        zIndex: 2,
        visible: true,
        opacity: 100,
        position: { x: 0, y: 0 },
        scale: 1.0,
        rotation: 0,
      },
    ];

    const result = validateOverlayGraph(tracks, 1920, 1080);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Max 2 visible"))).toBe(true);
  });

  it("should check for invalid opacity", () => {
    const tracks: TimelineTrack[] = [
      {
        id: "bg",
        type: "video",
        source: {} as File,
        startTime: 0,
        duration: 10,
        zIndex: 0,
        visible: true,
        opacity: 150, // Invalid
        position: { x: 0, y: 0 },
        scale: 1.0,
        rotation: 0,
      },
    ];

    const result = validateOverlayGraph(tracks, 1920, 1080);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("opacity"))).toBe(true);
  });
});

describe("generateExampleOverlayGraphs", () => {
  it("should generate example graphs", () => {
    const examples = generateExampleOverlayGraphs();
    expect(examples).toHaveProperty("2-track-pip");
    // The filter complex will be generated (even if empty for pass-through)
    expect(typeof examples["2-track-pip"]).toBe("string");
    // Example tracks should be listed
    expect(examples).toHaveProperty("example-background-track");
    expect(examples).toHaveProperty("example-overlay-track");
  });
});
