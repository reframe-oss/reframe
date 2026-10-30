import { describe, it, expect, vi, afterEach } from "vitest";
import { rumInit, renderDatadogInit } from "./datadogInitHarness";

afterEach(() => vi.unstubAllEnvs());

describe("DatadogInit on localhost (this test run)", () => {
  it("never starts RUM or contacts Datadog, even with real-looking keys", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "pub0000");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "");
    const requests = await renderDatadogInit();
    expect(rumInit).not.toHaveBeenCalled();
    expect(requests.filter((u) => /datadoghq|browser-intake|ddog/.test(u))).toEqual([]);
  });

  it("refuses an explicit production env locally", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "pub0000");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "production");
    await renderDatadogInit();
    expect(rumInit).not.toHaveBeenCalled();
  });

  it("does nothing, and breaks nothing, without configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "unit-test");
    await expect(renderDatadogInit()).resolves.toEqual([]);
    expect(rumInit).not.toHaveBeenCalled();
  });
});
