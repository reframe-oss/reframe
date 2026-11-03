import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DatadogRum } from "@datadog/browser-rum";
import { profileKind, trackFeature } from "../featureTelemetry";
import { registerRum, resetTelemetryForTests } from "../telemetry";

let rum: { addAction: ReturnType<typeof vi.fn>; addDurationVital: ReturnType<typeof vi.fn> };

beforeEach(() => {
  localStorage.clear();
  resetTelemetryForTests();
  vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "token");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "unit-test");
  rum = { addAction: vi.fn(), addDurationVital: vi.fn() };
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
