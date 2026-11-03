import { defineConfig, devices } from "@playwright/test";

// End-to-end export tests against the production build (out/), served with
// the same cross-origin isolation headers as Netlify.
//
//   scripts/make-fixtures.sh --small
//   NEXT_PUBLIC_DATADOG_ENV=off bun run build
//   bunx playwright test
//
// Two projects: "multi-threaded" (COOP/COEP set, so @ffmpeg/core-mt loads,
// as on the live site) and "single-threaded" (no isolation headers).
export default defineConfig({
  testDir: "test/e2e",
  // Each test runs real FFmpeg.wasm encodes; one worker keeps CPU contention
  // from making timings meaningless.
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["junit", { outputFile: "test-results/e2e-junit.xml" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "multi-threaded", use: { baseURL: "http://127.0.0.1:4173" } },
    { name: "single-threaded", use: { baseURL: "http://127.0.0.1:4174" } },
  ],
  webServer: [
    {
      command: "node scripts/serve-isolated.mjs 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node scripts/serve-isolated.mjs 4174",
      url: "http://127.0.0.1:4174",
      env: { ISOLATED: "0" },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
