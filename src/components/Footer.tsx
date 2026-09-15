"use client";

import Link from "next/link";
import {
  Github,
  Twitter,
  Instagram,
  Linkedin,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  ExternalLink,
  Lock,
  Mail,
  HeartHandshake,
} from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full border-t border-[var(--border)] bg-[var(--bg)] text-[var(--text)] px-6 py-16 mt-20 transition-colors duration-300">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-y-12 md:gap-x-12">
        {/* Brand Section */}
        <div className="md:col-span-5 space-y-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Reframe</h2>
            <p className="text-[10px] font-mono tracking-[0.35em] uppercase opacity-50 mt-1">
              Browser Video Studio
            </p>
          </div>

          <p className="text-sm opacity-70 leading-relaxed max-w-md">
            Professional video processing directly in your browser using{" "}
            <span className="font-medium opacity-100">FFmpeg.wasm</span> — fast, private, and open
            source.
          </p>

          <div className="flex flex-wrap gap-2">
            {[
              { icon: <ShieldCheck size={12} />, label: "100% Local" },
              { icon: <Zap size={12} />, label: "Fast" },
              { icon: <Globe size={12} />, label: "Open Source" },
            ].map((tag) => (
              <span
                key={tag.label}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[10px] font-semibold tracking-wide uppercase opacity-80 hover:opacity-100 hover:border-[var(--accent)] transition-all"
              >
                {tag.icon}
                {tag.label}
              </span>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="md:col-span-3 space-y-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-60">
            Navigation
          </h3>

          <nav className="flex flex-col gap-3 text-sm">
            <a
              href="https://github.com/reframe-oss/reframe"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="flex items-center gap-2 opacity-70 hover:opacity-100 hover:text-[var(--accent)] transition-all w-fit focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded"
            >
              <Github size={14} />
              GitHub
              <ExternalLink size={10} className="opacity-60" />
            </a>

            <Link
              href="/contact"
              aria-label="Contact page"
              className="flex items-center gap-2 opacity-70 hover:opacity-100 hover:text-[var(--accent)] transition-all w-fit focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded"
            >
              <Mail size={14} />
              Contact
            </Link>

            <Link
              href="/privacy"
              aria-label="Privacy policy"
              className="flex items-center gap-2 opacity-70 hover:opacity-100 hover:text-[var(--accent)] transition-all w-fit focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded"
            >
              <Lock size={14} />
              Privacy Policy
            </Link>

            {/* Netlify's open source plan expects a publicly reachable Code of
                Conduct. Points at the repo file rather than an in-site route,
                since CODE_OF_CONDUCT.md is the canonical copy. */}
            <a
              href="https://github.com/magic-peach/reframe/blob/main/CODE_OF_CONDUCT.md"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Code of Conduct"
              className="flex items-center gap-2 opacity-70 hover:opacity-100 hover:text-[var(--accent)] transition-all w-fit focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded"
            >
              <HeartHandshake size={14} />
              Code of Conduct
              <ExternalLink size={10} className="opacity-60" />
            </a>
          </nav>
        </div>

        {/* Right Section */}
        <div className="md:col-span-4 space-y-10 md:justify-self-end w-full md:w-auto">
          {/* Newsletter */}

          <div className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-60">Updates</h3>

            <form
              className="flex items-center w-full sm:w-80 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)] transition"
              onSubmit={(e) => e.preventDefault()}
              aria-label="Newsletter signup"
            >
              <input
                type="email"
                required
                placeholder="Enter your email"
                aria-label="Email address"
                className="w-full bg-transparent py-3 px-1 text-[11px] font-semibold tracking-widest uppercase placeholder:opacity-30 outline-none focus:outline-none focus:ring-0 border-none"
              />

              <button
                type="submit"
                aria-label="Subscribe to updates"
                onMouseDown={(e) => e.preventDefault()}
                className="text-[var(--accent)] hover:text-[var(--accent-hover)] transition p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded ml-1"
              >
                <ArrowRight size={16} />
              </button>
            </form>
          </div>

          {/* Community */}

          <div className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-60">
              Community
            </h3>

            <div className="flex items-center gap-3 flex-wrap">
              {[
                {
                  href: "https://github.com/reframe-oss/reframe",
                  icon: <Github size={18} />,
                  label: "GitHub",
                },
                {
                  href: "https://twitter.com",
                  icon: <Twitter size={18} />,
                  label: "Twitter",
                },
                {
                  href: "https://instagram.com",
                  icon: <Instagram size={18} />,
                  label: "Instagram",
                },
                {
                  href: "https://linkedin.com",
                  icon: <Linkedin size={18} />,
                  label: "LinkedIn",
                },
              ].map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="relative group p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <span className="opacity-70 group-hover:opacity-100">{social.icon}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-[var(--border)] flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.25em] opacity-50">
        <p>© {new Date().getFullYear()} Reframe · MIT License</p>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
            Processing happens locally
          </div>

          {/* Deploys by Netlify.
              The SVG is self-hosted rather than hotlinked from netlify.com on
              purpose: this site sends Cross-Origin-Embedder-Policy:require-corp
              to enable SharedArrayBuffer for the multi-threaded FFmpeg core, and
              netlify.com serves this asset with no CORP and no CORS header, so a
              cross-origin <img> would be blocked by the browser and the badge
              would silently not render. Same-origin assets are exempt. The link
              still points at netlify.com, which is what their OSS plan asks for. */}
          <a
            href="https://www.netlify.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Deploys by Netlify"
            className="opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/badges/netlify-badge-color-accent.svg"
              alt="Deploys by Netlify"
              width={114}
              height={50}
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
