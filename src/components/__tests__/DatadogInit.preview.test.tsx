// @vitest-environment-options {"url": "https://deploy-preview-1802--reframe-os.netlify.app/"}
import { describe, it, expect, vi, afterEach } from "vitest";
import { rumInit, renderDatadogInit } from "./datadogInitHarness";

afterEach(() => vi.unstubAllEnvs());

describe("DatadogInit on a Netlify deploy preview", () => {
  it("tags events preview, never production", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "pub0000");
    vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "");
    // Even if a preview were built with the production context.
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_CONTEXT", "production");
    await renderDatadogInit();
    expect(rumInit.mock.calls[0]![0]).toMatchObject({ env: "preview" });
  });
});
