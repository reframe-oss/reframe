"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

/**
 * Lazy-load VideoEditor (the heaviest component ~32 KB).
 * `ssr: false` is required because VideoEditor uses browser-only APIs
 * (e.g. URL.createObjectURL, navigator, ffmpeg.wasm).
 */
const VideoEditor = dynamic(() => import("@/components/VideoEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
        <p className="text-xs font-mono uppercase tracking-widest opacity-60">Loading editor…</p>
      </div>
    </div>
  ),
});

/**
 * Footer lives below the fold — load it lazily so it never blocks
 * the critical rendering path.
 */
const Footer = dynamic(() => import("@/components/Footer"), {
  ssr: false,
  loading: () => null,
});

export default function Home() {
  return (
    <>
      <a
        href="https://github.com/reframe-oss/reframe"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View Reframe on GitHub"
        className="hidden sm:flex fixed top-4 right-4 md:right-16 z-50 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[10px] font-heading font-semibold uppercase tracking-wider transition-all duration-200 ease-in-out hover:scale-105 hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] hover:shadow-[var(--shadow)]"
      >
        ⭐ Star on GitHub
      </a>

      <main id="main-content" tabIndex={-1}>
        <Suspense fallback={null}>
          <VideoEditor />
        </Suspense>
      </main>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}

