import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
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