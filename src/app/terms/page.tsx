import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ArrowLeft, ShieldCheck, Scale, AlertCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms and Conditions — Reframe",
  description:
    "Terms and Conditions for Reframe — client-side open-source video editing tools.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] pt-20 pb-20">
      {/* Back link */}
      <div className="max-w-4xl mx-auto px-6 mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] transition-colors hover:text-[var(--text)] py-1 px-2.5 rounded-[var(--radius)] hover:bg-[var(--surface)] w-fit"
        >
          <ArrowLeft size={14} />
          Back to Reframe
        </Link>
      </div>

      <div className="max-w-4xl mx-auto px-6">
        {/* Header Section */}
        <div className="mb-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent-muted)] text-[var(--accent)] flex items-center justify-center mb-6">
            <Scale size={32} />
          </div>

          <h1 className="text-4xl sm:text-5xl font-heading font-extrabold tracking-tight mb-4 text-[var(--text)]">
            Terms and Conditions
          </h1>
          <p className="text-sm text-[var(--muted)] max-w-xl">
            Last updated: October 2026. Please read these terms carefully before using Reframe.
          </p>
        </div>

        {/* Content Container */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 sm:p-12 shadow-sm">
          <div className="prose prose-invert prose-lg max-w-none space-y-8">
            <div className="p-4 rounded-[var(--radius)] border border-[var(--accent-muted)] bg-[var(--accent-muted)]/30 text-sm text-[var(--text)] flex items-start gap-3">
              <ShieldCheck size={20} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Summary:</strong> Reframe is a free, client-side, open-source video editing tool. Your media never leaves your device. You own your content, and you are responsible for the files you process and export.
              </p>
            </div>

            <section>
              <h2 className="text-2xl font-heading font-semibold text-[var(--text)] mb-3">
                1. Acceptance of Terms
              </h2>
              <p className="text-[var(--muted)] leading-relaxed">
                By accessing and using Reframe (&ldquo;the Service&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;), you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the application.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-heading font-semibold text-[var(--text)] mb-3">
                2. Nature of the Service
              </h2>
              <p className="text-[var(--muted)] leading-relaxed">
                Reframe is a browser-based, client-side multimedia processing tool powered by WebAssembly (FFmpeg.wasm). All editing, trimming, resizing, cropping, and rendering operations execute locally within your browser runtime context without uploading source videos to any server.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-heading font-semibold text-[var(--text)] mb-3">
                3. User Responsibilities &amp; Content Ownership
              </h2>
              <p className="text-[var(--muted)] leading-relaxed mb-4">
                You retain complete ownership and all intellectual property rights to any videos, audio tracks, and images you import or export through Reframe. Because all processing occurs locally on your machine:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--muted)]">
                <li>You are solely responsible for ensuring you have all necessary rights, licenses, and permissions for any media you process.</li>
                <li>You agree not to process media that infringes on third-party intellectual property, privacy, or proprietary rights.</li>
                <li>You assume all responsibility for backing up your original media files prior to processing.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-heading font-semibold text-[var(--text)] mb-3">
                4. Acceptable Use Policy
              </h2>
              <p className="text-[var(--muted)] leading-relaxed mb-4">
                You agree to use Reframe only for lawful purposes. You shall not use Reframe to create, modify, or distribute:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--muted)]">
                <li>Content that is illegal, defamatory, abusive, harassing, or promotes violence and hatred.</li>
                <li>Malicious payloads or modified media intended to exploit software vulnerabilities.</li>
                <li>Media in violation of applicable copyright, trademark, or privacy laws.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-heading font-semibold text-[var(--text)] mb-3">
                5. Intellectual Property of Reframe
              </h2>
              <p className="text-[var(--muted)] leading-relaxed">
                Reframe is an open-source project distributed under open-source licensing terms. The application source code is publicly accessible on GitHub. All trademarks, branding, logos, and UI designs associated with Reframe are protected by applicable intellectual property guidelines.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-heading font-semibold text-[var(--text)] mb-3">
                6. Disclaimer of Warranties
              </h2>
              <div className="p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)]/50 text-sm text-[var(--muted)] space-y-2">
                <div className="flex items-center gap-2 font-semibold text-[var(--text)]">
                  <AlertCircle size={16} className="text-amber-500" />
                  <span>&ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo;</span>
                </div>
                <p className="leading-relaxed">
                  Reframe is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis without warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.
                </p>
                <p className="leading-relaxed">
                  Video processing performance is strictly dependent on your client device hardware, browser WebAssembly support, and memory constraints. We do not guarantee uninterrupted, error-free, or lossless processing.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-heading font-semibold text-[var(--text)] mb-3">
                7. Limitation of Liability
              </h2>
              <p className="text-[var(--muted)] leading-relaxed">
                To the maximum extent permitted by applicable law, in no event shall the Reframe project, its creators, maintainers, or open-source contributors be liable for any direct, indirect, incidental, special, consequential, or punitive damages—including loss of data, loss of profits, system crash, or device impairment—arising out of or in connection with your use or inability to use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-heading font-semibold text-[var(--text)] mb-3">
                8. Changes to Terms
              </h2>
              <p className="text-[var(--muted)] leading-relaxed">
                We reserve the right to revise or update these Terms and Conditions at any time. Changes will be published directly to this page and reflected in the project repository. Continued use of Reframe after any updates constitutes your agreement to the modified terms.
              </p>
            </section>

            <div className="mt-12 pt-8 border-t border-[var(--border)] text-center text-sm text-[var(--muted)]">
              <p>
                Have questions regarding these Terms? Visit our{" "}
                <Link href="/privacy" className="text-[var(--accent)] hover:underline">
                  Privacy Policy
                </Link>{" "}
                or{" "}
                <Link href="/contact" className="text-[var(--accent)] hover:underline">
                  Contact Us
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
