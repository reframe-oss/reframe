import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  experimental: {
    scrollRestoration: true,
    /**
     * Tree-shake lucide-react so only the icons actually used in the
     * source are included in the production bundle, instead of the
     * full icon library (~2 MB uncompressed).
     */
    optimizePackageImports: ["lucide-react"],
  },
  // Required for ffmpeg.wasm to load WASM files correctly
  // Without this, Next.js might try to process .wasm files and break them
  webpack: (config) => {
    config.resolve.fallback = { fs: false };

    /**
     * Split large third-party dependencies into separate chunks so the
     * browser can cache them independently and users only re-download
     * what actually changed between versions.
     */
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        chunks: "all",
        cacheGroups: {
          // Keep ffmpeg.wasm in its own chunk — it is very large and
          // changes infrequently, so long-term caching is valuable.
          ffmpeg: {
            test: /[\\/]node_modules[\\/]@ffmpeg[\\/]/,
            name: "ffmpeg",
            chunks: "all",
            priority: 30,
            enforce: true,
          },
          // Group all other heavy vendor code together.
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
            priority: 10,
          },
        },
      },
    };

    return config;
  },
};

export default nextConfig;