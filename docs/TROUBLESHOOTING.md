# Troubleshooting and FAQ

## Setting up

### `bun install` fails

- Use [Bun](https://bun.sh) 1.x and Node.js 20.9 or newer (`bun --version`,
  `node --version`). Don't use npm or yarn: the project uses `bun.lock` only.
- Run `bun install --frozen-lockfile`. It installs exactly what `bun.lock`
  lists, the same as CI.
- If it still fails, **don't delete `bun.lock`** (that pulls in different
  versions and hides the real problem). Open an issue with the full error
  output, your OS and the Bun and Node versions.

### "lockfile had changes, but lockfile is frozen"

`package.json` and `bun.lock` disagree. If you changed dependencies, run
`bun install` (without `--frozen-lockfile`) and commit the updated `bun.lock`
with your change. If you didn't, your branch is behind `main`: merge `main`.

### Environment variables aren't picked up

- Copy `.env.example` to `.env.local`. All keys are optional; without the
  Datadog ones, telemetry is simply off.
- Restart `bun run dev`: environment variables are read only at startup.

## Running

### Exports are slow, and the browser console says the engine is single-threaded

The fast multi-threaded engine needs the page to be cross-origin isolated
(COOP/COEP headers). `bun run dev` doesn't send them. To test the
multi-threaded engine, build and serve the static export with the headers:

```bash
bun run build
node scripts/serve-isolated.mjs   # http://127.0.0.1:4173
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting.

### An export stops making progress

Reframe stops it after a while and, on the multi-threaded engine, retries on
the single-threaded one automatically. If that also stalls you'll see a
message with **Retry export**. Large files need a lot of memory: close other
tabs, or trim the clip or lower the output resolution first.

### Changes to `src/lib/ffmpeg*.ts` don't show up

The FFmpeg worker stays loaded across Fast Refresh. Reload the page fully.

## FAQ

### How do I start the project?

```bash
bun install --frozen-lockfile
bun run dev
```

### How do I run the tests?

`bun run test` for unit tests, and `bunx playwright test` for the end-to-end
export tests (see [CONTRIBUTING.md](../CONTRIBUTING.md#set-up) for the
one-time setup).

### How do I report a bug?

Open an [issue](https://github.com/reframe-oss/reframe/issues/new) with the
steps to reproduce, what you expected, what happened, your browser and OS,
and the console error if there is one. Please don't attach private videos.

### Does Reframe upload my video?

No. Videos are processed on your device. Reframe sends anonymous performance
and error data, which you can turn off under **Settings** (the privacy page).
See [DATADOG.md](DATADOG.md) for exactly what is sent.
