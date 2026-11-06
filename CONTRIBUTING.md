# Contributing to Reframe

Thank you for helping. Fixes, features, tests, docs, design and accessibility
work are all welcome, from a typo to a new editing tool.

Questions and ideas go to
[Discussions](https://github.com/reframe-oss/reframe/discussions); bugs and
concrete tasks go to [issues](https://github.com/reframe-oss/reframe/issues).

- [Set up](#set-up)
- [Claim an issue](#claim-an-issue)
- [Branches and commits](#branches-and-commits)
- [Before you open a pull request](#before-you-open-a-pull-request)
- [Pull requests and review](#pull-requests-and-review)
- [Project rules](#project-rules)
- [Development tips](#development-tips)
- [Reporting bugs and suggesting features](#reporting-bugs-and-suggesting-features)
- [GSSoC'26 participants](#gssoc26-participants)

## Set up

You need [Git](https://git-scm.com), [Bun](https://bun.sh) 1.x, Node.js 20.9 or
newer, and a recent Chrome, Firefox or Safari. This project uses **Bun and `bun.lock` only**: don't
use npm or yarn, and never commit `package-lock.json` or `yarn.lock`.

```bash
# Fork on GitHub, then:
git clone https://github.com/<your-username>/reframe.git
cd reframe
git remote add upstream https://github.com/reframe-oss/reframe.git
bun install
bun run dev        # http://localhost:3000
```

| Command | What it does |
|---|---|
| `bun run dev` | Development server with Fast Refresh |
| `bun run lint` | ESLint |
| `bunx tsc --noEmit` | Type check |
| `bun run test` | Unit tests (Vitest) |
| `bun run build` | Static production build into `out/` |
| `bunx playwright test` | End-to-end export tests (see below) |
| `bun run storybook` | Component stories |

The end-to-end tests export real videos. Before the first run:

```bash
brew install ffmpeg            # or: sudo apt-get install ffmpeg
scripts/make-fixtures.sh --small
bunx playwright install chromium
NEXT_PUBLIC_DATADOG_ENV=off bun run build
bunx playwright test
```

Keep your fork current with `git fetch upstream && git merge upstream/main`.

## Claim an issue

Pick an issue from
[good first issue](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3A%22good+first+issue%22),
[bug](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Abug),
[enhancement](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Aenhancement)
or [documentation](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3Adocumentation).

- Comment **`/assign`** on an open, unassigned issue. The bot assigns it to the
  first person who asks.
- One person per issue, and at most **5 issues** at a time.
- No activity for 2 days gets a reminder, 4 days a final warning, and after
  **5 days** the issue is unassigned. Any comment on the issue resets the timer,
  so say if you're stuck.
- Comment **`/unassign`** if you can't finish. That's fine.

Please don't open a pull request for an issue assigned to someone else.

## Branches and commits

Branch from an up-to-date `main` and name the branch by type:

| Prefix | For |
|---|---|
| `feat/` | New features, e.g. `feat/crop-tool` |
| `fix/` | Bug fixes, e.g. `fix/trim-end-validation` |
| `docs/` | Documentation, e.g. `docs/deployment-guide` |
| `refactor/` | Restructuring with no behaviour change |
| `test/` | Tests only |
| `chore/` | Build, config, dependencies |

Commits follow [Conventional Commits](https://www.conventionalcommits.org):
`type(scope): what changed`, in the imperative.

```
feat(trim): set the trim end from the playhead with O
fix(export): stop the progress bar going backwards on retry
docs: explain cross-origin isolation in DEPLOYMENT.md
```

Avoid messages like "update", "changes" or "fixed stuff". Pull request titles
use the same format.

## Before you open a pull request

- [ ] `bun run lint` passes
- [ ] `bunx tsc --noEmit` passes
- [ ] `bun run test` passes, and new logic has tests
- [ ] `bun run build` succeeds
- [ ] For export or FFmpeg changes: `bunx playwright test` passes
- [ ] Tried in the browser: upload, edit, export and download
- [ ] UI changes checked at phone width, with keyboard only, and in dark mode
- [ ] New interactive elements have accessible names (`aria-label` or a label)
- [ ] The description says `Closes #<issue>`
- [ ] **UI or feature changes include a screen recording** (below)

### Screen recording

Any PR that adds or changes something visible must include a short recording
of the change working on your machine: run `bun run dev`, then show the whole
flow (upload → use the change → export → result) and any edge cases. On macOS
use Cmd+Shift+5, on Windows Win+G, on Linux OBS, or [Loom](https://loom.com)
anywhere. Drag the file into the PR, or paste a link. PRs without one aren't
merged until it's added.

## Pull requests and review

1. Push your branch and open a pull request against `main`. Fill in the
   template: what changed, why, and `Closes #<issue>`.
2. Automated checks run: lint, type check, tests, the build, a Netlify deploy
   preview, dependency and secret scans, and Chromatic visual review.
3. A maintainer reviews, usually within a few days. Reply to comments and push
   fixes to the same branch; don't open a new PR.
4. **A maintainer reviews, labels and merges every PR by hand.** No bot
   comments on, reviews, labels or closes pull requests, and inactive PRs are
   never closed automatically. You can't add labels yourself (GitHub only lets
   maintainers), so there's no need to ask.

**Visual review (Chromatic).** Every PR's Storybook is screenshotted and
compared with `main`. Visual changes don't fail your PR; a maintainer accepts
or rejects them. If you change a component, add or update its story in
`src/components/<Component>.stories.tsx`, and keep stories free of anything
time-dependent (clocks, carousels, autoplay). Maintainers can re-run visual
review on a fork PR with the `visual-review` label.

## Project rules

These come from how Reframe works; PRs that break them are sent back.

- **Static export.** `output: "export"` means no API routes, middleware, server
  actions or `not-found.tsx`. Headers belong in `netlify.toml` and
  `public/_headers`, not `next.config.ts`.
- **FFmpeg.wasm is the only video engine.** Don't add other video-processing
  libraries. FFmpeg command lines are built only in `src/lib/ffmpegArgs.ts`.
- **Design tokens.** Never rename the CSS variables `--bg`, `--surface`,
  `--border`, `--text`, `--muted`.
- **`cn()`** (clsx + tailwind-merge) for conditional classes; don't replace it
  with template strings.
- **React hooks** go before any early `return`.
- **Privacy.** Video content, file names, captions and paths never leave the
  device, telemetry included.

Code style: strict TypeScript (avoid `any`), function components and hooks,
Tailwind utility classes, the `@/` import alias, comments only where the code
can't explain itself, and no leftover `console.log`.

## Development tips

- **Fast Refresh** updates components instantly; you rarely need to restart.
- **FFmpeg changes** (`src/lib/ffmpeg*.ts`) often need a full page reload,
  because the worker and WebAssembly module stay loaded.
- **Watch the engine download** in the DevTools Network tab: failed `.wasm` or
  worker requests show up there.
- **Multi-threaded engine.** `bun run dev` isn't cross-origin isolated, so it
  uses the single-threaded engine. To test the multi-threaded one, build and
  run `node scripts/serve-isolated.mjs`.
- **Memory.** Exports can use a lot of memory; close other tabs and keep a few
  small test clips around (`scripts/make-fixtures.sh` makes some).
- **Environment variables** are read at startup: restart `bun run dev` after
  editing `.env.local` (see `.env.example`).
- Useful tools: [React DevTools](https://react.dev/learn/react-developer-tools),
  the Chrome [device toolbar](https://developer.chrome.com/docs/devtools/device-mode/),
  and [axe DevTools](https://www.deque.com/axe/devtools/) for accessibility.

Project layout: components in `src/components/`, hooks in `src/hooks/`, FFmpeg
code in `src/lib/` (`ffmpeg.ts` client, `ffmpeg.worker.ts` worker,
`ffmpegArgs.ts` command builder). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Reporting bugs and suggesting features

**Bugs:** open an issue with the steps to reproduce, what you expected, what
happened, your browser and OS, and screenshots or the console error if you
have them. Please don't attach private videos.

**Features:** open an issue with a clear title, what the feature does, and why
it would be useful. Check for an existing issue first.

**Security problems:** don't open a public issue; see [SECURITY.md](SECURITY.md).

## GSSoC'26 participants

Reframe is an official [GirlScript Summer of Code 2026](https://gssoc.girlscript.tech)
project.

- Look for issues labelled
  [`gssoc'26`](https://github.com/reframe-oss/reframe/issues?q=is%3Aopen+label%3A%22gssoc%2726%22),
  starting with `good first issue` if you're new.
- Claim with `/assign` and link your PR with `Closes #<issue>`.
- **Points count only after a maintainer adds `gssoc:approved`** to your merged
  PR. Labels for difficulty (`level:*`), type (`type:*`) and quality are added
  by maintainers by hand.
- Small, focused PRs are reviewed and merged faster. Quality beats quantity.

Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).
Thank you for making Reframe better.
