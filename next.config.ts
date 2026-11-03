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

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_DEPLOY_CONTEXT: deployContext(),
  },
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