import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DatadogRum } from "@datadog/browser-rum";
import { profileKind, toolsUsed, trackExportTools, trackFeature } from "../featureTelemetry";
import { DEFAULT_RECIPE } from "../constants";
import { registerRum, resetTelemetryForTests } from "../telemetry";

let rum: { addAction: ReturnType<typeof vi.fn>; addDurationVital: ReturnType<typeof vi.fn>; addError: ReturnType<typeof vi.fn> };

beforeEach(() => {
  localStorage.clear();
  resetTelemetryForTests();
  vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "token");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "unit-test");
  rum = { addAction: vi.fn(), addDurationVital: vi.fn(), addError: vi.fn() };
  registerRum(rum as unknown as DatadogRum);
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetTelemetryForTests();
});

describe("feature usage telemetry", () => {
  it("reports one feature_used event with the feature and action", () => {
    trackFeature("safe_area", "show");
    expect(rum.addAction).toHaveBeenCalledWith("feature_used", { feature: "safe_area", action: "show" });
  });

  it("reports built-in profiles by slug and everything else as custom", () => {
    expect(profileKind("builtin:square-1080")).toBe("square-1080");
    expect(profileKind("builtin:made-up")).toBe("custom");
    expect(profileKind("user:4f3a")).toBe("custom");
    expect(profileKind(undefined)).toBe("custom");
  });

  it("never sends a user's profile name or id", () => {
    trackFeature("export_profile", "apply", { profile: "My holiday reels settings" });
    trackFeature("export_profile", "apply", { profile: "user:1234-abcd" });
    const sent = JSON.stringify(rum.addAction.mock.calls);
    expect(sent).not.toContain("holiday");
    expect(sent).not.toContain("1234");
    expect(rum.addAction.mock.calls.map(([, ctx]) => ctx.profile)).toEqual(["custom", "custom"]);
  });
});

describe("tools used by an export", () => {
  const recipe = (o: Partial<typeof DEFAULT_RECIPE> = {}) => ({ ...DEFAULT_RECIPE, ...o });

  it("a default recipe uses no tools", () => {
    expect(toolsUsed(recipe())).toEqual([]);
  });

  it("detects each tool from the recipe", () => {
    expect(
      toolsUsed(
        recipe({ trimStart: 1, rotate: 90, speed: 2, keepAudio: false, brightness: 0.1, framing: "fill", preset: "custom" }),
        { music: true, imageOverlay: true }
      )
    ).toEqual(["trim", "rotate", "speed", "mute", "image_overlay", "background_music", "color_adjustments", "fill_framing", "custom_size"]);
  });

  it("sends one event per tool with no values", () => {
    trackExportTools(recipe({ trimEnd: 4, sharpness: 2 }));
    expect(rum.addAction.mock.calls).toEqual([
      ["feature_used", { feature: "trim", action: "exported" }],
      ["feature_used", { feature: "sharpen", action: "exported" }],
    ]);
  });
});
