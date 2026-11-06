# Security pipeline

How Reframe checks dependencies, secrets and workflows, what blocks a
merge, and how exceptions are handled. Reporting a vulnerability is covered
by [SECURITY.md](../SECURITY.md).

## Checks

`.github/workflows/security.yml` runs on pull requests to `main`, on pushes
to `main`, weekly (Mondays 04:17 UTC) and on demand. It has `contents: read`
only and uses no secrets, so pull requests from forks are covered too.

| Job | What it checks | Blocks? |
|---|---|---|
| Dependency policy (bun.lock) | `bun audit` on `bun.lock` (the exact versions that are built), filtered through `security/audit-exceptions.json` | **yes**, on any high or critical advisory without a valid exception |
| Secret scan (gitleaks) | the pull request's new commits (the full history on `main`), values redacted | **yes** |
| Workflow lint (actionlint) | every workflow, with shellcheck on their scripts | **yes** |

Snyk runs separately in `snyk.yml`. Deployment configuration is checked by
`src/lib/tests/deployConfig.test.ts` and `deploy-smoke.yml`.

To make these merge requirements, a maintainer adds the three jobs as
required checks on `main` (a ruleset change).

## Dependency policy

- **High and critical** advisories block, unless `security/audit-exceptions.json`
  has an exception for that exact package and advisory.
- **Moderate and low** advisories are listed and never block; review them in
  the weekly run.
- **Every exception needs** a `reason` (why it isn't exploitable here, or why
  it can't be fixed yet), the `reviewed` date and an `expires` date at most 90
  days out. An expired exception blocks again, and one that no longer matches
  anything is reported for removal.
- **Fixing:** prefer the smallest upgrade that leaves the vulnerable range,
  within the existing semver ranges. A transitive package can be lifted with
  an entry in `package.json` `overrides`. Take major upgrades in their own
  pull request, with the full test suite. Keep peer-coupled packages on one
  version: all `storybook`/`@storybook/*` packages, `next` with
  `eslint-config-next`, `react` with `react-dom`.

Run it locally with `bun run audit`.

### Triage, 2026-11-06

`bun audit` on `main` before this pipeline: 1 critical and 20 high advisories,
all in development, test and build tooling (none ship to users).

| Package | Severity | Action |
|---|---|---|
| `storybook`, `@storybook/*` 10.5.10 | critical, high | **Fixed**: 10.6.6 (all Storybook packages together) |
| `vitest` 4.1.11, `vite` 8.2.2 | high, moderate | **Fixed**: vitest 4.1.12; vite 8.3.6 via `overrides` |
| `undici` 7.29.0 (jsdom), `zod` 4.5.4 (eslint-plugin-react-hooks), `source-map-js` 1.2.1 | high | **Fixed** within range via `overrides` |
| `image-size` (Storybook) | high | **Fixed** by the Storybook upgrade |
| `brace-expansion` 1.1.18 and 5.0.9 (ESLint's minimatch) | high | **Exception** until 2027-02-03: dev-only glob matching of repo-written patterns; two majors in use and bun has no nested overrides |
| `webpack-dev-middleware` 6.1.3 | high | **Exception** until 2027-02-03: Storybook's local dev server only; the fix is v7, which Storybook doesn't allow yet |

Runtime packages (`@ffmpeg/ffmpeg`, `@ffmpeg/util`, `@datadog/browser-rum*`,
`react`, `react-dom`, `next` and the rest) were left on their current
versions: none has a high or critical advisory.

After the fixes: 0 blocking, 5 excepted (the two packages above), 14
moderate or low.

## Snyk

Snyk is connected through its GitHub integration (a webhook on the repo)
to the `akankshatrehun` Snyk organisation, where `reframe-oss/reframe` has
two projects: **package.json** (open-source dependencies) and **Code
analysis** (Snyk Code). It adds two checks to pull requests from this
repository, `security/snyk` and `license/snyk`, and `snyk.yml` runs the CLI
(`snyk test`, high and critical only) on pushes to main, on same-repo pull
requests and weekly. Snyk can't read `bun.lock`, so that job tests a
`package-lock.json` generated from `package.json`; the bun.lock policy above
is the exact check. On main and the weekly run it also records what it
tested (`snyk monitor`) as the Snyk project `reframe-oss/reframe-ci`, so the
dashboard tracks those versions and Snyk alerts when a new advisory affects
them.

Required on `main` (the `main-protection` ruleset): `build`, `Dependency
scan`, `Dependency policy (bun.lock)`, `Secret scan (gitleaks)`, `Workflow
lint (actionlint)` and `security/snyk`. `Dependency scan` is skipped on pull
requests from forks (no secrets there), which counts as passing.

`.snyk` holds the policy: open-source ignores (none) and the paths Snyk Code
skips (test-only code).

### Snyk Code triage, 2026-11-06

14 findings on `d1ff303`:

| Finding | Where | Outcome |
|---|---|---|
| Path traversal (high) | `ffmpeg.worker.ts`: the engine's input file name took its extension from the user's file name | **Fixed**: every engine file name uses a letters-and-digits extension (`safeExtension`); a test feeds `../` names |
| ReDoS (high) | `sw.js`: `cache.match(request.url)` | **False positive**: Cache Storage matching compares URLs, it builds no regular expression. Ignored in Snyk with this reason |
| Hardcoded password (medium) | `check-deploy.mjs`: an object key named `pass` | **Fixed**: keys are the `RESULT` constants |
| postMessage origin (low) | `sw.js` message handler | **Fixed**: messages from other origins are ignored |
| postMessage origin (low) | `ffmpeg.worker.ts` message handler | **False positive**: a dedicated worker only receives messages from the page that created it. Ignored in Snyk |
| Path traversal ×6 (low) | `build-sw-manifest.mjs`, `strip-sourcemaps.mjs`: a directory from the command line | **Fixed**: both refuse a directory outside the repository (one deletes files) |
| Cleartext HTTP, no rate limit (medium ×2) | `scripts/serve-isolated.mjs`: the local test server on 127.0.0.1 | **Excluded** from Snyk Code (test-only) |
| Cleartext HTTP (low) | `deployCheck.test.ts`: a fixture server | **Excluded** (test-only) |

## Secrets

On 2026-11-06, gitleaks 8.21.2 (redacted) found no secrets in the full
history (654 commits). If a scan ever finds a real secret: rotate it first,
then remove it from history with the maintainers' agreement, and never paste
the value into an issue or pull request.
