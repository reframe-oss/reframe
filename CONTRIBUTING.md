> ⭐ **If Reframe helped you, [star the repo](https://github.com/reframe-oss/reframe)** — it helps more people discover it!
>
> 💬 **Have a question or idea?** Head to [Discussions](https://github.com/reframe-oss/reframe/discussions) instead of opening an issue.
>
> 🟢 **Ready to contribute?** Check out our [Good First Issues](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3A%22good+first+issue%22) — perfect for first-time contributors!

***

# Contributing to Reframe

First off, **thank you for considering contributing to Reframe**! 🎉

Whether you're fixing a typo, adding a feature, improving accessibility, or writing a test — every contribution makes Reframe better for everyone.

---

## 👋 Want to contribute to reframe-oss/reframe?

If you have a bug or an idea, read this guide before opening an issue.

If you're ready to tackle some open issues, **[we've collected some good first issues for you](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3A%22good+first+issue%22)**.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Finding Issues](#finding-issues)
- [Claiming Issues](#-claiming-issues)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Visual Review (Chromatic)](#visual-review-chromatic)
- [Code Style](#code-style)
- [Development Tips](#development-tips)
- [GSSoC'26 Participants](#gssoc26-participants)
- [Code of Conduct](#code-of-conduct)

---

## Getting Started

### Prerequisites

- [Git](https://git-scm.com)
- [Bun](https://bun.sh) (recommended) — or Node.js 18+
- A modern browser (Chrome, Firefox, or Safari)

### Fork and Clone

```bash
# 1. Fork the repo by clicking 'Fork' on GitHub

# 2. Clone your fork
git clone https://github.com/<your-username>/reframe.git
cd reframe

# 3. Add the upstream remote
git remote add upstream https://github.com/reframe-oss/reframe.git
```

---

## Development Setup

```bash
# Install dependencies
bun install

# Start the development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Changes to components reflect instantly with [Next.js Fast Refresh](https://nextjs.org/docs/architecture/fast-refresh).

### Other Commands

```bash
bun run build      # Build for production (outputs to out/)
bun run lint       # Run ESLint
bunx tsc --noEmit  # Run TypeScript type checking
```

---

## Project Structure

```
reframe/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, metadata, fonts
│   │   ├── page.tsx            # Home page
│   │   └── globals.css         # Global styles
│   ├── components/
│   │   ├── VideoEditor.tsx     # Root editor component
│   │   ├── FileUpload.tsx      # Drag-drop file upload
│   │   ├── VideoPreview.tsx    # HTML5 video player
│   │   ├── PresetSelector.tsx  # 11 preset formats + custom
│   │   ├── FramingControl.tsx  # Fit/Fill framing toggle
│   │   ├── TrimControl.tsx     # Start/end time inputs
│   │   ├── RotateControl.tsx   # Rotation buttons
│   │   ├── AudioSpeedControl.tsx  # Audio + speed
│   │   ├── ExportSettings.tsx  # Quality CRF slider
│   │   ├── ExportOverlay.tsx   # Export progress modal
│   │   ├── DownloadResult.tsx  # Success + download
│   │   └── LottiePlayer.tsx    # Lottie animation wrapper
│   ├── hooks/
│   │   └── useVideoEditor.ts   # Main state management hook
│   └── lib/
│       ├── ffmpeg.ts           # FFmpeg wrapper & filter builders
│       ├── presets.ts          # Preset definitions
│       └── types.ts            # TypeScript types
├── public/                     # Static assets
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```
---

## Development Tips

### 1. Next.js Fast Refresh
This project uses Next.js Fast Refresh in development mode. Most changes to React components, hooks, and styles are reflected instantly in the browser without restarting the dev server.

- Component updates appear immediately
- State is often preserved during edits
- Restarting `npm run dev` is usually unnecessary for UI changes

Learn more: https://nextjs.org/docs/architecture/fast-refresh

---

### 2. FFmpeg Module Changes
Changes to `ffmpeg.ts` may not hot-reload correctly because FFmpeg initialization and WebAssembly modules can persist in memory.

If updates are not reflected:

- Perform a full browser page reload
- Clear cached worker instances if necessary
- Restart the development server only when required

FFmpeg WASM reference: https://ffmpegwasm.netlify.app/docs/overview

---

### 3. Monitor FFmpeg Downloads
FFmpeg WebAssembly assets can be large and may take time to download during development.

Use the browser DevTools **Network** tab to:

- Verify FFmpeg assets are loading correctly
- Inspect caching behavior
- Detect failed `.wasm` or worker requests
- Measure initialization performance

Chrome DevTools: https://developer.chrome.com/docs/devtools/network

---

### 4. Use React DevTools
Install React DevTools for easier component inspection and debugging.

Helpful for:

- Inspecting component props and state
- Tracing re-renders
- Debugging hooks
- Monitoring React component trees

React DevTools: https://react.dev/learn/react-developer-tools

---

### 5. Keep Console Open During Development
The browser console provides important runtime diagnostics for:

- FFmpeg initialization issues
- Hydration warnings
- API request failures
- WebAssembly loading errors

Filtering logs by warnings/errors can speed up debugging significantly.

---

### 6. Use Source Maps for Easier Debugging
Development builds include source maps, allowing you to debug original TypeScript/React source files directly from DevTools.

Tips:

- Set breakpoints in source files
- Use async stack traces
- Inspect runtime variables during rendering

JavaScript debugging guide: https://developer.chrome.com/docs/devtools/javascript

---

### 7. Watch for Memory Usage
FFmpeg WebAssembly processing can consume significant browser memory during video operations.

Recommendations:

- Close unused tabs while testing
- Refresh the page after heavy processing tasks
- Monitor memory usage in browser performance tools

Performance tools: https://developer.chrome.com/docs/devtools/performance

---

### 8. Verify Environment Variables
After modifying `.env.local`, restart the Next.js development server because environment variables are loaded only during server startup.

Example:

```bash
npm run dev
```

Environment variables guide: https://nextjs.org/docs/app/guides/environment-variables

---

## Finding Issues

We have **300+ open issues** across all skill levels:

| Level | Where to look |
|-------|--------------|
| 🟢 **Beginner** | [`good first issue`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3A%22good+first+issue%22) label — 100+ beginner tasks |
| 🟡 **Intermediate** | [`enhancement`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Aenhancement) label |
| 🔴 **Advanced** | [`feature`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Afeature) label |
| 🐛 **Bug Fixes** | [`bug`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Abug) label |
| ♿ **Accessibility** | [`accessibility`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Aaccessibility) label |
| 📝 **Documentation** | [`documentation`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Adocumentation) label |
| 🔒 **Security** | [`security`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Asecurity) label |
| ⚡ **Performance** | [`performance`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Aperformance) label |

**Before claiming an issue:**
1. Check if it already has an assignee — if so, pick a different one
2. Comment `/assign` on the issue to claim it instantly via our bot
3. If an issue has been idle and unassigned for a while, it's fair game

---

## 🙋 Claiming Issues

We use a bot to automatically manage issue assignments. Here's how it works:

### Claiming an Issue
Comment `/assign` on any open issue to claim it:
- The bot will assign it to you instantly
- You have **5 days** to make progress before it is automatically unassigned
- You can only hold **5 issues** at a time across the repo

### Unassigning Yourself
If you can no longer work on an issue, comment `/unassign` to release it:
- This frees it up for other contributors immediately
- No hard feelings — we appreciate the honesty!

### Assignment Rules
- ✅ First person to comment `/assign` gets the issue
- ✅ Only **one contributor** can be assigned per issue at a time
- ✅ Maximum **5 issues** per contributor at once
- ⚠️ You will get a warning after **2 days** of no activity
- ⚠️ You will get a final warning after **4 days** of no activity
- ❌ Issue is automatically unassigned after **5 days** of no activity

### Inactivity Warnings
The bot will ping you if your assigned issue has no activity:
- **Day 2** — friendly reminder to update your progress
- **Day 4** — final warning, 24 hours left before unassignment
- **Day 5** — automatic unassignment, issue reopens for others

### Tips
- Leave a comment on your issue if you are stuck or need help — any comment resets the inactivity timer
- Link your PR to the issue using `Fixes #issue_number` in your PR description
- If you see an issue already assigned, please pick a different one

---

## Making Changes

### 1. Create a branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/bug-description
# or
git checkout -b docs/what-you-documented
```

### 2. Make your changes

- Keep changes focused — one issue per PR
- Test your changes in the browser (test file upload, export, and download)
- Make sure `bun run lint` passes
- Make sure `bunx tsc --noEmit` passes (no TypeScript errors)

### 3. Commit your changes

```bash
git add <files>
git commit -m "feat: add aria-label to export button"
```

**Commit message format:**
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation changes
- `refactor:` — code refactoring (no behavior change)
- `test:` — adding or fixing tests
- `style:` — formatting, whitespace changes
- `chore:` — build config, dependencies

---

## Submitting a Pull Request

1. Push your branch: `git push origin feat/your-feature-name`
2. Go to your fork on GitHub and click **"Compare & pull request"**
3. Fill in the PR template:
   - Describe what you changed and why
   - Reference the issue: `Closes #<issue-number>`
   - **Attach a screen recording** (required for UI/feature changes — see below)
4. Submit the PR — maintainers will review within a few days

### Screen Recording Requirement

**Any PR that adds or modifies a UI element, a user-facing feature, or any visual behaviour must include a screen recording of the working change running on your local machine.**

This is a hard requirement — PRs without a recording will not be merged until one is added.

**What to record:**
- Run `bun run dev` and open `http://localhost:3000`
- Demonstrate the full working flow of your change (e.g. upload a video → use the new control → export → see the result)
- Show any edge cases your implementation handles (empty state, error state, etc.)

**How to record:**
- **macOS**: `Cmd + Shift + 5` → Record Selected Portion, or use QuickTime Player
- **Windows**: `Win + G` → Xbox Game Bar → Capture
- **Linux**: OBS Studio, GNOME Screenshot tool, or `kazam`
- **Any OS**: [Loom](https://loom.com) (free, great for sharing)

Attach the recording directly to the PR by dragging the file into the GitHub comment box, or paste a Loom/shareable link.

### PR Checklist

- [ ] Code works in Chrome, Firefox, and Safari
- [ ] No new TypeScript errors (`bunx tsc --noEmit`)
- [ ] ESLint passes (`bun run lint`)
- [ ] UI changes tested on mobile (use browser DevTools)
- [ ] Accessibility: new interactive elements have ARIA labels
- [ ] Issue number referenced in PR description
- [ ] **Screen recording attached** (required for all UI/feature PRs)

---

## Visual Review (Chromatic)

Every PR gets its Storybook screenshotted and diffed against `main` by
[Chromatic](https://www.chromatic.com/), so UI changes are reviewed visually
rather than guessed at from a diff.

You'll see up to three checks:

| Check | What it means |
|---|---|
| `Storybook Publish` | Your Storybook built and uploaded |
| `UI Tests` | Snapshots compared against the baseline |
| `Visual regression` / `Visual regression (fork)` | The workflow that ran it |

**Visual changes do not fail your PR.** If `UI Tests` says changes need
accepting, that is a maintainer's call, not a problem with your branch — a
maintainer accepts or rejects each change in the Chromatic UI.

**Maintainers:** to re-run visual review on a fork PR without asking the
contributor to push again, apply the `visual-review` label. Fork PRs are built
automatically on open and on every push; the label is for re-running on demand.

If your PR touches a component, please **add or update its story** in
`src/components/<Component>.stories.tsx`. Stories are what Chromatic can see;
a change with no story gets no visual review.

Avoid anything time-dependent inside a story — live clocks, carousels,
autoplaying animations. A screenshot taken at an arbitrary moment will differ
between runs and report a change that isn't real. Existing examples:
`ExportOverlay` marks its spinner and tip carousel `data-chromatic="ignore"`,
and `TrimControl` passes `file={null}` to avoid async audio decoding.

---

## Code Style

- **TypeScript**: Strict types, no `any` unless absolutely necessary
- **React**: Functional components only, use hooks
- **Tailwind**: Use utility classes; avoid inline `style={}` for static styles
- **No comments**: Code should be self-documenting via good naming; only add comments for non-obvious behavior
- **No console.log**: Remove debug logs before submitting
- **Imports**: Use relative imports within `src/`

---

## Development Tips

- **Next.js Fast Refresh**: Changes to React components update immediately in dev mode without restarting the server. Learn more in the [Next.js Fast Refresh docs](https://nextjs.org/docs/architecture/fast-refresh).
- **FFmpeg changes**: Changes to `src/lib/ffmpeg.ts` may require a full page reload because FFmpeg WASM state can stay cached in the browser.
- **FFmpeg downloads**: Use the [browser DevTools Network tab](https://developer.chrome.com/docs/devtools/network/) to monitor FFmpeg WASM downloads, cache behavior, and failed CDN requests.
- **Testing exports**: Keep a few small test videos (~5-10 MB) for quick export testing.
- **React DevTools**: Install the [React DevTools browser extension](https://react.dev/learn/react-developer-tools) for component inspection.
- **Responsive checks**: Use the [Chrome DevTools Device Toolbar](https://developer.chrome.com/docs/devtools/device-mode/) to test mobile layouts before opening a PR.
- **Accessibility checks**: Use the [axe DevTools browser extension](https://www.deque.com/axe/devtools/) to catch common accessibility issues.

---

## GSSoC'26 Participants

Reframe is an **official GirlScript Summer of Code 2026 project**!

### Getting Started as a GSSoC Contributor

1. Browse issues labeled [`gssoc'26`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3A%22gssoc%2726%22)
2. Start with [`good first issue`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3A%22good+first+issue%22+label%3A%22gssoc%2726%22) if you're new to open source
3. Comment `/assign` on the issue — our bot will assign it to you instantly, no maintainer needed
4. Submit your PR within **5 days** and remember to link it with `Fixes #issue_number`

### Tips for GSSoC Success

- **Read the issue fully** before starting — ask questions in comments if anything is unclear
- **Small, focused PRs** are merged faster than large ones
- **Quality over quantity** — one well-implemented feature beats five half-done ones
- **Be communicative** — comment on your progress, especially if you're stuck
- **Test thoroughly** — check your changes work before submitting

---

## Questions?

- **Found a bug?** → [Open a bug report](https://github.com/reframe-oss/reframe/issues/new?labels=bug)
- **Have a feature idea?** → [Open a feature request](https://github.com/reframe-oss/reframe/issues/new?labels=feature)
- **Stuck on an issue?** → Comment on the issue and tag `@magic-peach`

---

## Code of Conduct

We expect all contributors to follow our Code of Conduct to create a safe, welcoming, and inclusive community.
- **Be respectful and welcoming.**
- **Harassment and discrimination are strictly prohibited.**
- **Constructive feedback is encouraged.**

Thank you for making Reframe better! 🎬

## Cross-Origin Isolation & GitHub Pages

This project uses `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`
headers to enable cross-origin isolation, which allows FFmpeg.wasm to run in
multi-threaded mode for significantly faster video exports.

**GitHub Pages does not support custom HTTP headers.**
If you are deploying to GitHub Pages, cross-origin isolation cannot be enabled
and FFmpeg will automatically fall back to single-threaded mode.

For full multi-threading support, deploy to **Vercel**, **Netlify**, or
**Cloudflare Pages** where custom headers are supported.
