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
