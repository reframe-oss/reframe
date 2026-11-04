import { describe, it, expect } from "vitest";
import { estimateRemainingMs } from "../ExportOverlay";

describe("estimateRemainingMs", () => {
  it("extrapolates from progress so far", () => {
    expect(estimateRemainingMs(25, 10_000)).toBe(30_000);
    expect(estimateRemainingMs(50, 20_000)).toBe(20_000);
  });

  it("stays quiet while it would be a guess, or when nearly done", () => {
    expect(estimateRemainingMs(2, 10_000)).toBeNull();
    expect(estimateRemainingMs(40, 2_000)).toBeNull();
    expect(estimateRemainingMs(99, 60_000)).toBeNull();
  });
});
