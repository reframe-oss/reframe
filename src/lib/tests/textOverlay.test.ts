import { describe, it, expect } from "vitest";
import { buildTextFilter, createDefaultTextOverlay, TEXT_FONT_FILE } from "../text-overlay";

const overlay = (o: Partial<ReturnType<typeof createDefaultTextOverlay>> = {}) => ({ ...createDefaultTextOverlay(), ...o });

describe("buildTextFilter", () => {
  it("always uses the bundled font file (FFmpeg.wasm has no system fonts)", () => {
    const f = buildTextFilter(overlay({ fontFamily: "Inter" }), 1920, 1080);
    expect(f).toContain(`fontfile=${TEXT_FONT_FILE}`);
    // `font=` needs fontconfig, which FFmpeg.wasm lacks.
    expect(f).not.toMatch(/:font=/);
  });

  it("never passes fontweight, which drawtext doesn't have (it failed every text export)", () => {
    for (const fontWeight of ["normal", "bold", "900"] as const) {
      expect(buildTextFilter(overlay({ fontWeight }), 1920, 1080)).not.toContain("fontweight");
    }
  });

  it("draws bold as an outline in the text colour", () => {
    expect(buildTextFilter(overlay({ fontWeight: "normal" }), 1920, 1080)).not.toContain("borderw");
    const bold = buildTextFilter(overlay({ fontWeight: "bold", color: "#ff0000", fontSize: 56 }), 1920, 1080);
    expect(bold).toMatch(/borderw=2:bordercolor=#ff0000/);
  });

  it("positions by percentage and escapes drawtext's special characters", () => {
    const f = buildTextFilter(overlay({ text: "50% off: it's 'here'", x: 25, y: 10 }), 1000, 500);
    expect(f).toContain("x=250:y=50");
    expect(f).toContain("text='50%% off\\: it\\'s \\'here\\''");
  });
});
