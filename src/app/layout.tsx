import type { Metadata } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";
import DatadogInit from "@/components/DatadogInit";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle, ContrastToggle } from "@/components/ThemeToggle";
import ScrollToTop from "@/components/ScrollToTop";
import BrandLogo from "@/components/BrandLogo";
import Link from "next/link";
import localFont from "next/font/local";

// The editorial serif, served from this origin (COEP-safe, no request to
// Google) with a size-adjusted fallback so the swap causes no layout shift.
// The files are subset to the weights and characters the UI uses; rebuild
// them with scripts/fonts/build-cormorant.sh. Upright is preloaded because
// the drop-zone headline (the LCP element) uses it; italic is only used for
// small labels.
const cormorant = localFont({
  src: "./fonts/cormorant-garamond-upright-400-500.woff2",
  weight: "400 500",
  style: "normal",
  display: "swap",
  adjustFontFallback: "Times New Roman",
  variable: "--font-cormorant",
});
const cormorantItalic = localFont({
  src: "./fonts/cormorant-garamond-italic-400.woff2",
  weight: "400",
  style: "italic",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  variable: "--font-cormorant-italic",
});

export const metadata: Metadata = {
  title: "Reframe — Resize, trim, and export videos in your browser",
  description: "Free, open-source video editor that runs entirely in your browser. No login, no uploads, no ads. Resize for any platform, trim, rotate, adjust speed, and export.",
   keywords: [
    "video editor",
    "browser video editor",
    "open source video editor",
    "resize videos",
    "trim videos",
    "rotate videos",
    "online video editor",
  ],

  authors: [{ name: "Reframe" }],

  openGraph: {
    title: "Reframe",
    description:
      "Free, open-source browser-based video editor. Resize, trim, rotate, and export videos directly in your browser.",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Reframe",
    description:
      "Free, open-source browser-based video editor. Resize, trim, rotate, and export videos directly in your browser.",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${cormorant.variable} ${cormorantItalic.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            // Runs before first paint so the saved theme, contrast preference
            // and privacy-notice dismissal never cause a flash or layout shift.
            __html: `(function() {
  try {
    var d = document.documentElement;
    var theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      d.classList.add('dark');
    } else {
      d.classList.remove('dark');
    }
    var contrast = localStorage.getItem('contrast');
    if (contrast === 'more' || (!contrast &&
        window.matchMedia('(prefers-contrast: more)').matches)) {
      d.dataset.theme = 'high-contrast';
    }
    var until = Number(localStorage.getItem('reframe_privacy_banner_dismissed_until'));
    if (until && Date.now() < until) d.setAttribute('data-privacy-dismissed', '');
  } catch(e) {}
})();`,
          }}
        />
        {/* FFmpeg core is fetched from jsDelivr on first export only, so a DNS
            hint is enough; a preconnect at page load would be wasted. */}
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
      </head>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        <DatadogInit />
      <a href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-control focus:border focus:border-[var(--border)] focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:text-[var(--text)]"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <ErrorBoundary>
            <header
              role="banner"
              className="enter sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]"
            >
              <div className="mx-auto flex h-[52px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                <Link
                  href="/"
                  className="flex items-center gap-2.5 rounded-control text-[var(--text)]"
                  aria-label="Reframe home"
                >
                  <BrandLogo size={20} />
                  <span className="serif text-[1.375rem] leading-none">Reframe</span>
                </Link>
                <nav aria-label="Site" className="flex items-center gap-1.5">
                  <a
                    href="https://github.com/reframe-oss/reframe"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm mr-1 hidden sm:inline-flex"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
                    </svg>
                    Star on GitHub
                  </a>
                  <ContrastToggle />
                  <ThemeToggle />
                </nav>
              </div>
            </header>
            <main id="main-content" tabIndex={-1}>
              {children}
            </main>
            <ScrollToTop />
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
