<div align="center">

<img src="public/favicon.svg" alt="" width="72" height="72">

# Reframe

**Resize, trim and convert videos in your browser. Your video never leaves your device.**

[![Stars](https://img.shields.io/github/stars/reframe-oss/reframe?style=flat-square&logo=github)](https://github.com/reframe-oss/reframe/stargazers)
[![Issues](https://img.shields.io/github/issues/reframe-oss/reframe?style=flat-square)](https://github.com/reframe-oss/reframe/issues)
[![License](https://img.shields.io/github/license/reframe-oss/reframe?style=flat-square)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![CI](https://github.com/reframe-oss/reframe/actions/workflows/main.yml/badge.svg?branch=main)](https://github.com/reframe-oss/reframe/actions/workflows/main.yml?query=branch%3Amain)
[![Netlify Status](https://api.netlify.com/api/v1/badges/fc902da9-9876-4298-9aea-f930075f8d95/deploy-status)](https://app.netlify.com/sites/reframe-os/deploys)
[![Known Vulnerabilities](https://snyk.io/test/github/reframe-oss/reframe/badge.svg)](https://snyk.io/test/github/reframe-oss/reframe)

### [Open Reframe → reframe-os.netlify.app](https://reframe-os.netlify.app)

<!-- TODO: replace with a short screen recording of an export (docs/assets/demo.gif, under 5 MB). -->
<img src="docs/assets/demo-placeholder.svg" alt="Demo coming soon" width="640">

</div>

## Features

- Resize for Reels, TikTok, Shorts, Instagram, YouTube and more, or any custom size; fit or fill
- Trim, rotate, change speed (0.25× to 4×), mute or adjust audio, add background music
- Text and image overlays; brightness, contrast, saturation and sharpness
- Export to MP4, WebM, MKV or GIF with a quality slider
- Undo and redo, recovery after a refresh, and project files you can reopen
- Export profiles: built-in and saved output settings in one click, with safe-area guides ([docs/EXPORT_PROFILES.md](docs/EXPORT_PROFILES.md))
- Keyboard shortcuts for everything common: see [docs/USAGE.md](docs/USAGE.md)

## How it works

Reframe runs [FFmpeg](https://ffmpeg.org) compiled to WebAssembly
([FFmpeg.wasm](https://ffmpegwasm.netlify.app)) in a Web Worker, so your video
is processed on your own device and the page stays responsive. When the site is
cross-origin isolated (the `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy` headers), browsers allow `SharedArrayBuffer` and
Reframe uses the faster multi-threaded FFmpeg; otherwise it falls back to the
single-threaded build. The details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

You need [Bun](https://bun.sh) 1.x and Node.js 20.9 or newer.

```bash
git clone https://github.com/reframe-oss/reframe.git && cd reframe
bun install
bun run dev
```

Then open http://localhost:3000. Deploying your own copy: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Something not working? See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Privacy

Your videos never leave your device. Reframe collects anonymous performance and
error data to improve export reliability; you can opt out in Settings.
Exactly what is sent, and what never is, is listed on the
[privacy page](https://reframe-os.netlify.app/privacy) and in
[docs/DATADOG.md](docs/DATADOG.md).

## Contributing

Contributions of every size are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
to set up, claim an issue with `/assign`, and open a pull request.

## Part of GirlScript Summer of Code 2026

<a href="https://gssoc.girlscript.tech">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/gssoc-dark.svg">
    <img src="docs/assets/brand/gssoc-light.svg" alt="GirlScript Summer of Code 2026" height="48">
  </picture>
</a>

Reframe was an official GSSoC'26 project. Pick one of the
[`gssoc'26` issues](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3A%22gssoc%2726%22)
and claim it by commenting `/assign` ([how claiming works](CONTRIBUTING.md#claim-an-issue)).
Maintainers add the labels.

## Supported by

<p>
  <a href="https://www.netlify.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/netlify-dark.svg">
      <img src="docs/assets/brand/netlify-light.svg" alt="Deploys by Netlify" height="40">
    </picture>
  </a>
  &nbsp;&nbsp;
  <a href="https://snyk.io">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/snyk-dark.svg">
      <img src="docs/assets/brand/snyk-light.svg" alt="Snyk" height="40">
    </picture>
  </a>
  &nbsp;&nbsp;
  <a href="https://www.datadoghq.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/datadog-dark.png">
      <img src="docs/assets/brand/datadog-light.png" alt="Datadog" height="40">
    </picture>
  </a>
  &nbsp;&nbsp;
  <a href="https://www.chromatic.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/chromatic-dark.svg">
      <img src="docs/assets/brand/chromatic-light.svg" alt="Chromatic" height="40">
    </picture>
  </a>
</p>

[Netlify](https://www.netlify.com) hosts the site and its deploy previews.
[Snyk](https://snyk.io) scans dependencies for vulnerabilities.
[Datadog](https://www.datadoghq.com) Real User Monitoring tracks export
reliability, through the Datadog Open Source Program.
[Chromatic](https://www.chromatic.com) runs visual review of UI changes.

## Contributors

<a href="https://github.com/reframe-oss/reframe/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=reframe-oss/reframe&max=500" alt="Contributors to Reframe">
</a>

Reviewers, mentors, designers and others who don't commit code are credited
with [all-contributors](.github/ALL_CONTRIBUTORS.md).

## License

[MIT](LICENSE)
