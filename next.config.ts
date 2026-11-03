import type { NextConfig } from "next";

/**
 * The hosting platform's own deploy context, read at build time: Netlify's
 * CONTEXT (production / deploy-preview / branch-deploy / dev) or Vercel's
 * VERCEL_ENV (production / preview / development). Empty for local builds.
 * Telemetry only reports as production when this says "production"
 * (src/lib/telemetry.ts, resolveTelemetryEnv).
 */
function deployContext(): string {
  return (process.env.CONTEXT || process.env.VERCEL_ENV || "").trim().toLowerCase();
}

/**
 * The commit being built: Netlify's COMMIT_REF, GitHub Actions' GITHUB_SHA,
 * or Vercel's. Reported to Datadog RUM as the version, and used as the
 * source-map release, so errors are tied to the code that produced them.
 * "dev" for local builds.
 */
function release(): string {
  const sha = (process.env.COMMIT_REF || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "").trim();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 12).toLowerCase() : "dev";
}

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_DEPLOY_CONTEXT: deployContext(),
    NEXT_PUBLIC_RELEASE: release(),
  },
  // The same commit builds to the same files on Netlify and in CI, so the
  // source maps CI uploads match what production serves.
  generateBuildId: async () => release(),
  // Generated so CI can upload them to Datadog; netlify.toml deletes them
  // from the published site, so they are never served publicly.
  productionBrowserSourceMaps: true,
  experimental: {
    scrollRestoration: true,
  },
  // Required for ffmpeg.wasm to load WASM files correctly.
  // Without this, Next.js might try to process .wasm files and break them.
  // Next 16 defaults to Turbopack, which ignores this block entirely (and
  // errors loudly if it's present without an equivalent `turbopack` config)
  // — that's why dev/build scripts in package.json pass `--webpack` explicitly.
  webpack: (config) => {
    config.resolve.fallback = { fs: false };
    return config;
  },
};

export default nextConfig;