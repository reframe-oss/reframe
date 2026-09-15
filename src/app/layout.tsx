import type { Metadata } from "next";
import { Bebas_Neue, Syne, DM_Sans, Inter, Roboto, Poppins, Montserrat } from "next/font/google";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";
import DatadogInit from "@/components/DatadogInit";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import ScrollToTop from "@/components/ScrollToTop";
import BrandLogo from "@/components/BrandLogo";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function() {
  try {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch(e) {}
})();`,
          }}
        />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
      </head>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        <DatadogInit />
      <a href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-[var(--radius)] focus:border focus:border-[var(--border)] focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:text-[var(--text)]"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <ErrorBoundary>
            <header
              role="banner"
              className="sticky top-0 z-50 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 py-3 backdrop-blur"
            >
              <div className="flex items-center gap-2">
                <BrandLogo size={24} />
                <h1 className="text-lg font-semibold">Reframe</h1>
              </div>
              <ThemeToggle />
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
