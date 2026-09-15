# CLAUDE.md — Automated Repository Manager

This file instructs Claude Code (and the Claude GitHub App) how to behave as an automated manager for this repository.

---

## PR Automation

When triggered on a pull request:

**Step 1 — Resolve merge conflicts first (if any).**
Before reviewing code or checking CI, check whether the PR has merge conflicts. If it does, resolve them automatically as described in the Merge Conflict Resolution section below. Only proceed to steps 2–3 after the branch is clean.

**Step 2 — Check CI.**
Check whether **ALL** checks have passed — including tests and the Vercel deployment check.

**Step 3 — Review the code.**
Review for correctness, security issues, and adherence to the standards in this file.

**If ALL checks pass AND the code looks good** → merge the PR immediately using a squash merge. Leave a short comment explaining what was merged and why it passed.

**If ANY check failed OR the code has issues** → do NOT merge. Post a comment on the PR tagging the author (`@username`) with:
- A clear summary of what failed
- Specific steps they need to take to fix it
- A friendly but direct tone

Never merge a PR if any CI check or Vercel deployment check is still pending or has failed.

---

## Merge Conflict Resolution

When a PR has merge conflicts, resolve them automatically **before** doing anything else (before code review, before checking CI).

### Steps:

1. **Detect conflicts** — check the PR's mergeability via the GitHub API (`mergeable` field). If `mergeable: false`, proceed with resolution.

2. **Clone and resolve locally:**
   ```bash
   git clone https://github.com/reframe-oss/reframe.git
   cd reframe
   git fetch origin
   git checkout <pr-branch>
   git merge origin/main
   # resolve conflicts (see rules below)
   git add .
   git commit -m "chore: resolve merge conflicts with main"
   git push origin <pr-branch>
   ```

3. **Conflict resolution rules — apply these in order:**

   - **`src/app/page.tsx`** — Always keep the `main` version exactly. This file has a known stable structure; contributor changes that add a `<main>` wrapper or duplicate JSX must be discarded in favour of main.
   - **`bun.lock` / `package-lock.json`** — Keep `bun.lock` from `main`. Delete any `package-lock.json` the PR introduced.
   - **`src/app/layout.tsx` metadata** — Keep all fields from `main`; merge in any *new* fields from the PR branch (e.g. new `openGraph` keys). If the PR duplicates an existing field, keep the `main` version of that field.
   - **CSS variables in `src/app/globals.css`** — Keep `main`'s variable names (`--bg`, `--surface`, `--border`, `--text`, `--muted`). Discard any renames from the PR branch.
   - **`.github/workflows/`** — Keep `main` versions of all workflow files. Only accept new workflow files from the PR if they don't conflict.
   - **All other files** — Use standard semantic merge: keep both sets of changes if they don't logically conflict. If two edits touch the same line and both are meaningful, apply the PR's change on top of `main`'s version (i.e., prefer preserving contributor intent where safe).

4. **Post a comment** on the PR after pushing the resolved branch, tagging the author:

   > Hey @username! This PR had merge conflicts with `main` — I've resolved them automatically and pushed the result. Here's what was changed:
   >
   > - **`src/app/page.tsx`**: kept the `main` version (your `<main>` wrapper was removed — this file has a fixed structure)
   > - **`bun.lock`**: regenerated from `main` (removed `package-lock.json`)
   > - _(list each file and what decision was made)_
   >
   > CI has been re-triggered. If anything looks wrong, feel free to push additional changes.

5. **Do not resolve conflicts that require domain judgement** — if two branches both meaningfully modify the same function body in `src/lib/ffmpeg.ts` or a complex component, do not guess. Instead post a comment asking the author to rebase manually and explain exactly which lines conflict.

---

## Auto-Labeling Rules

Apply labels automatically whenever a PR or issue is opened. Do not wait to be asked.

### On every new PR — apply labels immediately:

#### Difficulty (required — pick exactly one):

| Label | When to apply |
|---|---|
| `level:beginner` | Small/simple changes: typo fixes, minor copy edits, single-line tweaks, docs-only changes, adding a missing `aria-label` |
| `level:intermediate` | Moderate changes: new UI components, multi-file features, hooks, non-trivial bug fixes |
| `level:advanced` | Complex features: significant refactors, new lib integrations, multi-component architecture changes, FFmpeg filter changes |
| `level:critical` | Security fixes, critical bug patches, breaking changes that affect the entire app |

Use the **diff size and conceptual complexity** together — a 200-line diff that only reformats code is still `level:beginner`; a 20-line diff that changes FFmpeg filter logic is `level:advanced`.

#### Quality (optional — apply if clearly warranted):

| Label | When to apply |
|---|---|
| `quality:clean` | Code is well-structured, readable, consistent with project style, and has no obvious issues |
| `quality:exceptional` | Outstanding quality: handles edge cases elegantly, adds meaningful tests, exemplary naming and structure |

Apply `quality:clean` only when the code is genuinely clean — not as a default. Apply `quality:exceptional` sparingly.

#### Type (optional — apply one or more that fit):

| Label | When to apply |
|---|---|
| `type:bug` | Fixes a bug or error in existing behavior |
| `type:feature` | Adds new user-facing functionality |
| `type:docs` | Documentation-only changes (README, CONTRIBUTING, code comments) |
| `type:testing` | Adds or improves tests |
| `type:security` | Security-related changes (CSP, SRI, input validation, auth) |
| `type:performance` | Improves speed, reduces bundle size, optimizes rendering |
| `type:design` | UI/UX changes (layout, styling, animations, visual improvements) |
| `type:refactor` | Code restructuring with no behavior change |
| `type:devops` | CI/CD, GitHub Actions workflows, config files, build tooling |
| `type:accessibility` | Accessibility improvements (ARIA, keyboard nav, contrast, screen reader support) |

Multiple type labels are fine when a PR genuinely covers multiple concerns (e.g., a bug fix that also improves accessibility gets both `type:bug` and `type:accessibility`).

#### GSSoC labels:

- Always add `gssoc'26` to every PR.
- **Do NOT add `gssoc:approved` automatically.** Only a human maintainer adds this label after reviewing the contribution. Without it, the contribution does not count for GSSoC points.

---

### On every new issue — apply labels immediately:

Apply the same type labels (`type:bug`, `type:feature`, `type:docs`, etc.) based on what the issue is about.
Apply one difficulty label (`level:*`) based on the estimated complexity of solving it.
Do **not** add `gssoc:approved` to issues — it only applies to PRs.

---

## Issue Triage & Assignment

When a new issue is opened:

1. Read the issue title and body carefully.
2. Post a welcoming comment that:
   - Acknowledges the issue
   - Asks clarifying questions if the issue is vague or missing reproduction steps
   - Explains what happens next (e.g., "a maintainer will review this soon")
3. Apply labels as described in the Auto-Labeling Rules above.
4. Scan all existing comments. If any commenter said something like "I'd like to work on this", "can I be assigned?", or "I want to take this" — assign the issue to the **first** person who made such a request. Only assign one person.

---

## Discussion & Open Issue Comments

When a new discussion is created or a comment is posted on an open issue:

1. Read the full thread for context.
2. Post a helpful, on-topic reply that answers the question, acknowledges feedback, or explains current status.
3. Keep replies concise and friendly. Do not post generic or filler responses.

---

## Code Standards

### Project Overview

Reframe is a **static Next.js 15 SPA** (`output: "export"`) — no server runtime. All video processing runs client-side via FFmpeg.wasm.

### Critical Rules

- **Lockfile**: This project uses `bun.lock`. Never commit `package-lock.json` or `yarn.lock`. Reject any PR that adds a wrong lockfile.
- **Static export**: `output: "export"` is set in `next.config.ts`. This means:
  - `not-found.tsx` is incompatible — reject PRs adding it
  - `headers()` in `next.config.ts` is silently ignored — security headers must go in `vercel.json`
  - No server-side features (API routes, middleware rewrites, etc.)
- **CSS variables**: The design system uses `--bg`, `--surface`, `--border`, `--text`, `--muted`. Do NOT rename these — it breaks all components. Reject PRs that rename CSS variables.
- **`cn()` utility**: Uses `clsx` + `tailwind-merge`. Never convert `cn()` calls to plain template literals — this loses Tailwind class conflict resolution.
- **React Hooks Rules**: All hooks (`useState`, `useEffect`, `useCallback`, etc.) must be called **before** any conditional `return`. Reject PRs where hooks appear after an early return.
- **FFmpeg dependency**: Do not add new video-processing dependencies (e.g., `mp4box`, `fluent-ffmpeg`). FFmpeg.wasm is the only video engine.

### Architecture

- Single `EditRecipe` object holds all user settings, updated via `updateRecipe(patch)` pattern
- FFmpeg.wasm (~30 MB) is lazy-loaded on first export only
- Components live in `src/components/`, hooks in `src/hooks/`, FFmpeg logic in `src/lib/ffmpeg.ts`

---

## GSSoC Label Schema

Every PR must have:
- One `level:*` label (difficulty) — applied automatically on open
- One or more `type:*` labels (category) — applied automatically on open
- `gssoc'26` label — applied automatically on open
- `gssoc:approved` label — **added by a maintainer only**, never automatically

**Quality multipliers** (optional, applied by maintainer):
- `quality:clean` — well-implemented, clean code
- `quality:exceptional` — outstanding implementation

**Score** = (difficulty × quality multiplier) + type bonus

---

## General Rules

- Always take real actions via the GitHub API — post comments, merge PRs, assign issues, apply labels.
- Follow the code style and architecture patterns visible in the existing codebase.
- Tag contributors by their GitHub username when addressing them in comments.
- If uncertain about something, post a comment asking for clarification rather than guessing.
