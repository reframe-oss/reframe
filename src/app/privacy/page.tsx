import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Reframe",
  description:
    "Privacy policy for Reframe — your videos never leave your device.",
};

export default function PrivacyPage() {
  return (
    <>
      <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] pt-24 pb-20">
        {/* Back link - top left below header */}
        <div className="px-6 mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Reframe
          </Link>
        </div>

        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-12 text-center flex flex-col items-center">
            {/* Eye Logo */}
            <div className="mb-6">
              <svg
                width="80"
                height="80"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-[var(--accent)]"
              >
                <path
                  d="M12 4.5C7 4.5 3 12 3 12C3 12 7 19.5 12 19.5C17 19.5 21 12 21 12C21 12 17 4.5 12 4.5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              </svg>
            </div>

            <h1 className="text-5xl font-bold tracking-tight mb-4">
              Privacy Policy
            </h1>
          </div>

          {/* Bordered Content Box */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-10 md:p-14">
            <div className="prose prose-invert prose-lg max-w-none">
              <p className="text-[var(--muted)] leading-relaxed">
                At Reframe, we respect your privacy and are committed to
                protecting your personal data. Reframe is designed as a fully
                local-first application, meaning all processing happens directly
                on your device and no media is ever transmitted to external
                servers.
              </p>

              <h2 className="text-2xl font-semibold mt-12 mb-6 text-[var(--text)]">
                1. Data Collection
              </h2>
              <p className="text-[var(--muted)]">
                Reframe does not collect, transmit, or process any personal data
                on external servers. All video processing is performed entirely
                on-device using FFmpeg.wasm. No raw video, audio, metadata, or
                derived content ever leaves your browser.
              </p>
              <p className="text-[var(--muted)] mt-4">
                Reframe embeds Datadog Real User Monitoring (RUM) to collect
                anonymous performance and error metrics — page views, load
                times, and JavaScript errors. Session replay is disabled.
                This telemetry never includes your video files, audio,
                filenames, exported content, or any other media you work
                with in the app. See{" "}
                <a
                  href="#telemetry"
                  className="text-[var(--accent)] hover:underline"
                >
                  Telemetry &amp; Diagnostics
                </a>{" "}
                below for details. Reframe does not embed advertising
                scripts.
              </p>

              <h2 className="text-2xl font-semibold mt-12 mb-6 text-[var(--text)]">
                2. File Handling
              </h2>
              <p className="text-[var(--muted)]">
                All files remain in your browser’s runtime memory or local
                processing context only. Reframe does not upload, store, or
                persist files on any server.
              </p>
              <p className="text-[var(--muted)] mt-4">
                Files are only temporarily accessible while you are actively
                using the application. Any persistence (such as downloads or
                exports) is explicitly initiated by you. Temporary browser
                caching may occur as part of standard browser behavior and is
                not controlled by Reframe.
              </p>

              <h2
                id="telemetry"
                className="text-2xl font-semibold mt-12 mb-6 text-[var(--text)]"
              >
                3. Telemetry & Diagnostics
              </h2>
              <p className="text-[var(--muted)]">
                Reframe uses Datadog RUM to collect anonymous, aggregate
                telemetry: page views, load performance, and JavaScript
                errors. This helps us catch bugs and performance regressions
                across browsers we don&apos;t personally test on.
              </p>
              <p className="text-[var(--muted)] mt-4">
                Session replay is explicitly disabled — Datadog never
                records or reconstructs what the editor looked like during
                your session. Telemetry is limited to metrics and error
                events; it does not and cannot include your video or audio
                files, filenames, export settings, or any content you
                create or edit in the app, since that data never leaves
                your browser in the first place (see Data Collection
                above).
              </p>

              <h2 className="text-2xl font-semibold mt-12 mb-6 text-[var(--text)]">
                4. Third-Party Dependencies
              </h2>
              <p className="text-[var(--muted)]">
                Reframe uses FFmpeg.wasm to perform local media processing
                within the browser. This library runs entirely on your device
                and does not send data externally.
              </p>
              <p className="text-[var(--muted)] mt-4">
                Any additional dependencies (such as CDNs for initial asset
                delivery) are used solely for application loading and do not
                receive user media or personal data.
              </p>

              <h2 className="text-2xl font-semibold mt-12 mb-6 text-[var(--text)]">
                5. Security Model
              </h2>
              <p className="text-[var(--muted)]">
                Reframe operates entirely within the browser sandbox. All
                processing is isolated to the client environment and requires no
                server communication for core functionality.
              </p>
              <p className="text-[var(--muted)] mt-4">
                This design ensures that your media never leaves your device,
                and security is enforced by the browser’s built-in execution
                boundaries.
              </p>

              <h2 className="text-2xl font-semibold mt-12 mb-6 text-[var(--text)]">
                6. Browser Storage Usage
              </h2>
              <p className="text-[var(--muted)]">
                Reframe does not use persistent storage mechanisms such as
                localStorage or IndexedDB for storing user media.
              </p>
              <p className="text-[var(--muted)] mt-4">
                If your browser temporarily caches assets or processing data,
                this is handled entirely by the browser and can be cleared
                through standard browser settings.
              </p>

              <h2 className="text-2xl font-semibold mt-12 mb-6 text-[var(--text)]">
                7. User Rights & Control
              </h2>
              <p className="text-[var(--muted)]">
                Because Reframe does not store or transmit user data, there are
                no server-side records to access, modify, or delete. Users
                retain full control of their data at all times, as all
                processing occurs locally.
              </p>

              <h2 className="text-2xl font-semibold mt-12 mb-6 text-[var(--text)]">
                8. Open Source Verification
              </h2>
              <p className="text-[var(--muted)]">
                Reframe is open source and publicly verifiable. The entire
                codebase, including processing logic, dependency usage, and
                exactly what telemetry is collected and how, can be audited
                on GitHub to confirm its local-first architecture.
              </p>

              <h2 className="text-2xl font-semibold mt-12 mb-6 text-[var(--text)]">
                9. Policy Updates
              </h2>
              <p className="text-[var(--muted)]">
                This Privacy Policy may be updated as Reframe evolves. Changes
                will be reflected in the public repository, and the latest
                version will always be available on this page.
              </p>

              <div className="mt-16 pt-8 border-t border-[var(--border)] text-center">
                <p className="text-[var(--muted)]">
                  If you have any questions about this Privacy Policy, please{" "}
                  <Link
                    href="/contact"
                    className="text-[var(--accent)] hover:underline"
                  >
                    contact us
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
