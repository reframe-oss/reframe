import { describe, it, expect } from "vitest";
import { captionOverlays, parseCaptions } from "../captions";
import { isValidRecipe } from "../types";
import { DEFAULT_RECIPE } from "../constants";

const SRT = `﻿1\r
00:00:01,000 --> 00:00:02,500\r
Hello <i>there</i>\r
\r
2\r
00:00:03,250 --> 00:00:05,000\r
{\\an8}Two\r
lines\r
\r
3\r
00:00:06,000 --> 00:00:06,000\r
zero length\r
`;

const VTT = `WEBVTT

NOTE a comment

intro
00:01.000 --> 00:02.000 align:start position:10%
<v Speaker>First</v>

01:00:00.5 --> 01:00:01.000
Late
`;

describe("parseCaptions", () => {
  it("reads SRT cues, dropping numbers, tags, BOM and CRLF", () => {
    expect(parseCaptions(SRT)).toEqual([
      { start: 1, end: 2.5, text: "Hello there" },
      { start: 3.25, end: 5, text: "Two\nlines" },
    ]);
  });

  it("reads WebVTT cues with settings, ids and short times", () => {
    expect(parseCaptions(VTT)).toEqual([
      { start: 1, end: 2, text: "First" },
      { start: 3600.5, end: 3601, text: "Late" },
    ]);
  });

  it("finds nothing in a file that isn't captions", () => {
    expect(parseCaptions("just some text\nno timings")).toEqual([]);
    expect(parseCaptions("")).toEqual([]);
  });

  it("caps each cue's text at the overlay length limit", () => {
    const long = "x".repeat(800);
    expect(parseCaptions(`00:00:01,000 --> 00:00:02,000\n${long}`)[0]!.text).toHaveLength(500);
  });
});

describe("captionOverlays", () => {
  const cues = parseCaptions(SRT);

  it("makes timed, boxed text near the bottom, sized for the output", () => {
    const [first] = captionOverlays(cues, 1920);
    expect(first).toMatchObject({ text: "Hello there", start: 1, end: 2.5, box: true, x: 50, y: 88, fontSize: 86 });
    expect(captionOverlays(cues, 100)[0]!.fontSize).toBe(12);
  });

  it("stops at the room left in the edit", () => {
    expect(captionOverlays(cues, 1080, 1)).toHaveLength(1);
    expect(captionOverlays(cues, 1080, 0)).toHaveLength(0);
  });

  it("produces overlays the editor accepts", () => {
    expect(isValidRecipe({ ...DEFAULT_RECIPE, textOverlays: captionOverlays(cues, 1080) })).toBe(true);
  });
});
