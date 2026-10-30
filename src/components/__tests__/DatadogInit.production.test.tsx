// @vitest-environment-options {"url": "https://reframe-os.netlify.app/"}
import { describe, it, expect, vi, afterEach } from "vitest";
import { rumInit, renderDatadogInit } from "./datadogInitHarness";

afterEach(() => vi.unstubAllEnvs());

describe("DatadogInit on the production host", () => {
  it("starts RUM tagged production, with session replay off", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "pub0000");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    // Netlify's CONTEXT=production, baked in by next.config.ts at build time.
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_CONTEXT", "production");
    await renderDatadogInit();
    expect(rumInit).toHaveBeenCalledTimes(1);
    expect(rumInit.mock.calls[0]![0]).toMatchObject({
      env: "production",
      service: "reframe",
      sessionReplaySampleRate: 0,
      enablePrivacyForActionName: true,
    });
  });

  it("stays off on the production host when nothing confirms a production build", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "pub0000");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_CONTEXT", "");
    const requests = await renderDatadogInit();
    expect(rumInit).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });
});
