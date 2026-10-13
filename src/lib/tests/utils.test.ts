import { describe, it, expect } from "vitest";
import { formatBytes, formatDuration, formatTrimTime } from "../utils";

describe("formatBytes", () => {
  it("returns '0 Bytes' for zero input", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
  });

  it("formats values below 1 KB as Bytes", () => {
    expect(formatBytes(512)).toBe("512 Bytes");
    expect(formatBytes(1)).toBe("1 Bytes");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  it("formats terabytes", () => {
    expect(formatBytes(1099511627776)).toBe("1 TB");
  });

  it("respects custom decimal precision", () => {
    expect(formatBytes(1536, 2)).toBe("1.5 KB");
    expect(formatBytes(1048576, 0)).toBe("1 MB");
    expect(formatBytes(123456789, 2)).toBe("117.74 MB");
  });

  it("clamps negative decimals to zero", () => {
    expect(formatBytes(1536, -1)).toBe("2 KB");
  });

  it("formats large terabyte values correctly", () => {
    expect(formatBytes(562949953421312)).toBe("512 TB");
  });
});

describe("formatDuration", () => {
  it("formats zero seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("formats seconds under one minute", () => {
    expect(formatDuration(5)).toBe("0:05");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats hours correctly", () => {
    expect(formatDuration(3605)).toBe("1:00:05");
  });

  it("handles NaN values", () => {
    expect(formatDuration(NaN)).toBe("0:00");
  });

  it("handles Infinity values", () => {
    expect(formatDuration(Infinity)).toBe("0:00");
  });

  it("handles negative values", () => {
    expect(formatDuration(-1)).toBe("0:00");
  });
});

describe("formatTrimTime", () => {
  it("formats raw seconds as MM:SS.d", () => {
    expect(formatTrimTime(65.5)).toBe("01:05.5");
  });

  it("pads seconds under one minute", () => {
    expect(formatTrimTime(5)).toBe("00:05.0");
  });

  it("preserves one decimal place", () => {
    expect(formatTrimTime(12.34)).toBe("00:12.3");
  });

  it("handles invalid values", () => {
    expect(formatTrimTime(NaN)).toBe("00:00.0");
    expect(formatTrimTime(Infinity)).toBe("00:00.0");
    expect(formatTrimTime(-1)).toBe("00:00.0");
  });
});
