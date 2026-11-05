import { describe, it, expect } from "vitest";
import { frameRateFromLog, joinedDuration, joinedFileName, joinProblem, MAX_JOIN_CLIPS, moveClip } from "../joinClips";
import { buildJoinArguments } from "../ffmpegArgs";

const clip = (o: Partial<{ size: number; width: number; height: number; duration: number }> = {}) => ({
  size: 10_000_000,
  width: 1920,
  height: 1080,
  duration: 5,
  ...o,
});

describe("joinProblem", () => {
  it("needs at least two clips and at most the limit", () => {
    expect(joinProblem([clip()])).toMatch(/at least one more/);
    expect(joinProblem([clip(), clip()])).toBeNull();
    expect(joinProblem(Array.from({ length: MAX_JOIN_CLIPS + 1 }, () => clip()))).toMatch(/up to 10/);
  });

  it("refuses more than 1 GB in all", () => {
    expect(joinProblem([clip({ size: 600 * 1024 ** 2 }), clip({ size: 500 * 1024 ** 2 })])).toMatch(/over 1 GB/);
  });

  it("allows at most three clips when any is larger than 1440p", () => {
    const uhd = clip({ width: 3840, height: 2160 });
    expect(joinProblem([uhd, clip(), clip()])).toBeNull();
    expect(joinProblem([uhd, clip(), clip(), clip()])).toMatch(/at most 3/);
  });
});

describe("join helpers", () => {
  it("adds up the length only when every clip's is known", () => {
    expect(joinedDuration([{ duration: 2 }, { duration: 3.5 }])).toBe(5.5);
    expect(joinedDuration([{ duration: 2 }, { duration: 0 }])).toBeNull();
    expect(joinedDuration([{ duration: Infinity }])).toBeNull();
  });

  it("names the output after the first clip", () => {
    expect(joinedFileName("trip.mov")).toBe("trip-joined.mp4");
    expect(joinedFileName("archive.tar.mkv")).toBe("archive.tar-joined.mp4");
  });

  it("moves a clip to a new place", () => {
    expect(moveClip(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveClip(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    const same = ["a", "b"];
    expect(moveClip(same, 1, 1)).toBe(same);
    expect(moveClip(same, 0, 5)).toBe(same);
  });

  it("reads the frame rate from FFmpeg's stream description", () => {
    expect(frameRateFromLog("Input #0\n  Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 1280x720, 2000 kb/s, 29.97 fps, 29.97 tbr")).toBe(29.97);
    expect(frameRateFromLog("  Stream #0:0: Video: vp8, yuv420p, 1280x720, SAR 1:1 DAR 16:9, 30 tbr, 1k tbn")).toBe(30);
    expect(frameRateFromLog("  Stream #0:1: Audio: aac, 48000 Hz, stereo")).toBeNull();
  });
});

describe("buildJoinArguments", () => {
  const base = { width: 1280, height: 720, fps: 30, outputName: "out.mp4", threads: 0 };

  it("fits every clip in the first clip's size and joins them in order", () => {
    const args = buildJoinArguments({
      ...base,
      inputs: [
        { path: "/j/clip0.mp4", hasAudio: true, duration: 3 },
        { path: "/j/clip1.mp4", hasAudio: true, duration: 2 },
      ],
    });
    expect(args.filter((a) => a === "-i")).toHaveLength(2);
    expect(args[args.indexOf("-i") + 1]).toBe("/j/clip0.mp4");
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30");
    expect(graph).toContain("[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:3");
    expect(graph).toMatch(/\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2:v=1:a=1\[v\]\[a\]$/);
    expect(args).toEqual(expect.arrayContaining(["-map", "[v]", "-map", "[a]", "-c:a", "aac"]));
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("gives a silent clip a silent track of its length", () => {
    const args = buildJoinArguments({
      ...base,
      inputs: [
        { path: "a.mp4", hasAudio: true, duration: 3 },
        { path: "b.mp4", hasAudio: false, duration: 2 },
      ],
    });
    expect(args[args.indexOf("-filter_complex") + 1]).toContain("anullsrc=r=48000:cl=stereo,atrim=0:2,asetpts=PTS-STARTPTS[a1]");
  });

  it("makes a video-only output when no clip has sound", () => {
    const args = buildJoinArguments({
      ...base,
      inputs: [
        { path: "a.mp4", hasAudio: false, duration: 3 },
        { path: "b.mp4", hasAudio: false, duration: 2 },
      ],
    });
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).not.toContain("anullsrc");
    expect(graph).toMatch(/concat=n=2:v=1:a=0\[v\]$/);
    expect(args).not.toContain("[a]");
    expect(args).not.toContain("aac");
  });

  it("rounds an odd size down to even numbers, which H.264 needs", () => {
    const args = buildJoinArguments({ ...base, width: 721, height: 1281, inputs: [{ path: "a", hasAudio: false, duration: 1 }, { path: "b", hasAudio: false, duration: 1 }] });
    expect(args[args.indexOf("-filter_complex") + 1]).toContain("scale=720:1280:");
  });

  it("caps threads on the multi-threaded core", () => {
    const args = buildJoinArguments({ ...base, threads: 4, inputs: [{ path: "a", hasAudio: true, duration: 1 }, { path: "b", hasAudio: true, duration: 1 }] });
    expect(args.slice(0, 4)).toEqual(["-threads", "4", "-i", "a"]);
    expect(args).toEqual(expect.arrayContaining(["-filter_complex_threads", "4"]));
  });
});
