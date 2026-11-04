// @vitest-environment-options {"url": "https://reframe-os.netlify.app/"}
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rumInit, renderDatadogInit } from "./datadogInitHarness";
import { setAnalyticsChoice } from "@/lib/analyticsConsent";

// A production build on the production host: RUM would start, unless the
// viewer or their browser says no.
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "doNotTrack", { configurable: true, get: () => null });
  Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, get: () => undefined });
  vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "pub0000");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
  vi.stubEnv("NEXT_PUBLIC_DEPLOY_CONTEXT", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("DatadogInit and the analytics choice", () => {
  it("starts with session replay off and privacy level mask when allowed", async () => {
    await renderDatadogInit();
    expect(rumInit).toHaveBeenCalledTimes(1);
    expect(rumInit.mock.calls[0]![0]).toMatchObject({
      sessionReplaySampleRate: 0,
      defaultPrivacyLevel: "mask",
      enablePrivacyForActionName: true,
      trackAnonymousUser: false,
    });
  });

  it("never initialises, or contacts Datadog, when turned off in Settings", async () => {
    setAnalyticsChoice(false);
    const requests = await renderDatadogInit();
    expect(rumInit).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it("never initialises when the browser sends Do Not Track", async () => {
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, get: () => "1" });
    const requests = await renderDatadogInit();
    expect(rumInit).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it("never initialises under Global Privacy Control", async () => {
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, get: () => true });
    await renderDatadogInit();
    expect(rumInit).not.toHaveBeenCalled();
  });
});
