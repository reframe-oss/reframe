# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in Reframe, please **do not** open a public GitHub issue until the vulnerability has been reviewed and fixed.

Instead, report it using one of the following methods:

- **GitHub Issue (labeled `security`):** Open a [new issue](https://github.com/reframe-oss/reframe/issues/new) and apply the `security` label. For sensitive details, use a private channel below.
- **Email:** Contact the maintainer directly at [maintainer email] with the subject line `[SECURITY] Reframe Vulnerability Report`.

### What to Include in Your Report

Please provide as much detail as possible to help us understand and reproduce the issue:

- A clear description of the vulnerability
- Steps to reproduce the issue
- The potential impact (e.g., data exposure, code execution)
- Any suggested mitigations or fixes (if known)

### Our Commitment

- We will acknowledge your report within **3 business days**
- We will provide a resolution timeline within **7 business days**
- We will credit you in the fix (unless you prefer to remain anonymous)

## Security Considerations

Reframe processes all video files **100% client-side** using FFmpeg.wasm. Your files are never uploaded to any server. However, vulnerabilities in the browser sandbox, WebAssembly execution, or third-party dependencies are still in scope for this policy.

## Scope

| In Scope | Out of Scope |
|----------|--------------|
| XSS / script injection vulnerabilities | Vulnerabilities in FFmpeg.wasm itself (report upstream) |
| Dependency vulnerabilities (npm packages) | Issues with user's browser or OS configuration |
| Malicious file handling / path traversal | Third-party CDN reliability |
| Logic bugs that could expose user data | Social engineering attacks |

## Disclosure Policy

We follow **responsible disclosure**. Please give us reasonable time to address the issue before any public disclosure. We aim to resolve critical vulnerabilities within **14 days** of confirmation.

## Dependency Security & Recurring Review Cadence

Reframe uses automated **Snyk** scanning and **Dependabot** to continuously inspect and update third-party dependencies:

- **Weekly Recurring Scans:** Snyk scans `main` every Monday at 06:00 UTC and on every push to detect high and critical severity CVEs.
- **Weekly Dependabot Updates:** Dependabot checks and proposes dependency updates weekly on Mondays.
- **Triage Cadence & Response SLA:**
  - **Critical findings:** Triaged within **48 hours**; resolved or mitigated within **7 days**.
  - **High findings:** Triaged within **5 business days**; resolved or mitigated within **14 days**.
- **Process Guide:** Full procedures for local scans, checking Dependabot overlap, lockfile rules, and `.snyk` exception policies are documented in [docs/DEPENDENCY_REVIEW.md](docs/DEPENDENCY_REVIEW.md).

