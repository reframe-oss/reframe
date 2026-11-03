import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DatadogRum } from "@datadog/browser-rum";
import {
  ANALYTICS_STORAGE_KEY,
  analyticsAllowed,
  browserDeclinesTracking,
  onAnalyticsChoiceChange,
  setAnalyticsChoice,
  storedAnalyticsChoice,
} from "../analyticsConsent";
import { registerRum, resetTelemetryForTests, sanitizeRumEvent, trackAction } from "../telemetry";

function setNavigator(props: { doNotTrack?: string | null; globalPrivacyControl?: boolean }) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { configurable: true, get: () => value });
  }
}

beforeEach(() => {
  localStorage.clear();
  setNavigator({ doNotTrack: null, globalPrivacyControl: undefined });
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetTelemetryForTests();
});

describe("analytics consent", () => {
  it("is on by default, with no stored choice", () => {
    expect(storedAnalyticsChoice()).toBeNull();
    expect(analyticsAllowed()).toBe(true);
  });

  it("remembers the viewer's choice in localStorage", () => {
    setAnalyticsChoice(false);
    expect(localStorage.getItem(ANALYTICS_STORAGE_KEY)).toBe("off");
    expect(analyticsAllowed()).toBe(false);
    setAnalyticsChoice(true);
    expect(analyticsAllowed()).toBe(true);
  });

  it("Do Not Track turns it off, and a stored 'on' can't override it", () => {
    setNavigator({ doNotTrack: "1" });
    expect(browserDeclinesTracking()).toBe(true);
    setAnalyticsChoice(true);
    expect(analyticsAllowed()).toBe(false);
  });

  it("Global Privacy Control turns it off", () => {
    setNavigator({ globalPrivacyControl: true });
    expect(analyticsAllowed()).toBe(false);
  });

  it("a DNT value of 0 doesn't count as declining", () => {
    setNavigator({ doNotTrack: "0" });
    expect(analyticsAllowed()).toBe(true);
  });

  it("a blocked storage read counts as no choice (on)", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(storedAnalyticsChoice()).toBeNull();
    expect(analyticsAllowed()).toBe(true);
    get.mockRestore();
  });

  it("notifies listeners when the choice changes", () => {
    const listener = vi.fn();
    const stop = onAnalyticsChoiceChange(listener);
    setAnalyticsChoice(false);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    setAnalyticsChoice(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("telemetry respects the choice", () => {
  const configure = () => {
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "token");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "unit-test");
    const rum = { addAction: vi.fn(), addDurationVital: vi.fn() };
    registerRum(rum as unknown as DatadogRum);
    return rum;
  };

  it("sends custom events while allowed", () => {
    const rum = configure();
    trackAction("export_started", { format: "mp4" });
    expect(rum.addAction).toHaveBeenCalledTimes(1);
  });

  it("sends nothing once turned off, even though RUM already started", () => {
    const rum = configure();
    setAnalyticsChoice(false);
    trackAction("export_started", { format: "mp4" });
    expect(rum.addAction).not.toHaveBeenCalled();
    // Automatically collected events are dropped in beforeSend.
    expect(sanitizeRumEvent({ type: "view", view: { url: "https://reframe-os.netlify.app/" } })).toBe(false);
  });

  it("strips any user identity from events", () => {
    const event = { type: "view", view: { url: "https://reframe-os.netlify.app/" }, usr: { anonymous_id: "abc" } };
    expect(sanitizeRumEvent(event)).toBe(true);
    expect(event).not.toHaveProperty("usr");
  });

  it("drops automatically collected events under Do Not Track", () => {
    setNavigator({ doNotTrack: "1" });
    expect(sanitizeRumEvent({ type: "error", error: { message: "x" } })).toBe(false);
  });
});
