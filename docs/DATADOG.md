# Datadog RUM: export reliability

Reframe reports, from the browser, whether each export succeeded, failed or was
cancelled. Datadog RUM adds the browser, operating system and device type on
its own, so we can see which browser and device combinations fail.

- SDK setup: `src/components/DatadogInit.tsx`
- Helpers, environment rules and scrubbing: `src/lib/telemetry.ts`
- Export and engine events: `src/lib/exportTelemetry.ts` (the only place they are sent)
- Importable dashboard: [`docs/datadog/export-reliability.dashboard.json`](datadog/export-reliability.dashboard.json)

## Privacy

- Session replay stays off (`sessionReplaySampleRate: 0`).
- Custom events carry only fixed enums, booleans, coarse buckets and
  millisecond durations. They never carry file names, captions, paths or exact
  values. `exportTelemetry.test.ts` fails if any other property appears.
- `sanitizeRumEvent` (used as `beforeSend`) removes query strings and hashes
  from URLs, drops `blob:`, `data:` and `file:` resources, and replaces the
  current file names, caption text, local paths and media file names in
  errors and action names with `[redacted]`.
- `enablePrivacyForActionName: true` masks auto-named clicks, which could
  otherwise carry the file name.

## Environments

`resolveTelemetryEnv` fails closed:

- RUM never starts on localhost, `*.local`, loopback or private-LAN addresses,
  or in automated browsers (`navigator.webdriver`), even though `.env.local`
  holds real keys.
- `production` needs the host's own deploy context to say so (Netlify's
  `CONTEXT` or Vercel's `VERCEL_ENV`, baked into `NEXT_PUBLIC_DEPLOY_CONTEXT`
  by `next.config.ts`), or an explicit `NEXT_PUBLIC_DATADOG_ENV=production`.
- Netlify deploy previews and branch deploys, and Vercel previews, report
  `preview` and are never relabelled `production`.
- To see real events from your machine, build with
  `NEXT_PUBLIC_DATADOG_ENV=local-perf` and use a normal browser. Set it to
  `off` to disable RUM anywhere.

## Events

| Event | When | Properties |
|---|---|---|
| `export_started` | Export clicked and settings validated | `format`, `resolution`, `input_size`, `clip_length`, `has_text`, `has_music`, `has_image_overlay`, `is_retry`, `retry_after` (retries only: the previous failure's category) |
| `export_succeeded` | Terminal | the context above, plus `engine`, `fell_back` (true after an engine fallback), `durationMs` (click to done), `encode_ms`, `output_size` |
| `export_failed` | Terminal | the context, plus `engine`, `durationMs`, `stage` (`engine` / `encode`), `category` |
| `export_cancelled` | Terminal: the user cancelled | the context, plus `engine`, `durationMs`, `stage` |
| `engine_fallback` | The multi-threaded engine stalled; the same export restarts automatically on the single-threaded engine. Not terminal: the attempt's outcome follows | the context, plus `from: multi`, `to: single`, `stall_reason` |
| `ffmpeg_load_success` | A worker loaded the engine (once per worker) | `engine` (`multi` / `single`, what actually loaded), `engine_requested`, `single_reason` (`not_isolated` / `after_stall` / `mt_load_failed`, single-threaded only), `load_number` (`first` / `repeat`), `durationMs` |
| `ffmpeg_load_failure` | A worker failed to load (not sent when the user cancelled) | `engine_requested`, `load_number`, `category` (`network` / `integrity` / `wasm` / `worker_script` / `unknown`), `durationMs` |
| `export` (duration vital) | With `export_succeeded`; encoding time only | the context, plus `engine` |
| `ffmpeg_init` (duration vital) | With `ffmpeg_load_success` | `engine`, `load_number` |
| Global context | Every event | `cross_origin_isolated`, `shared_array_buffer`, `cpu_cores`, `device_memory_gb`, `reduced_motion` |

`engine` is `none` when the export ended before the engine was ready.

Buckets:

- `resolution` (short side of the output): `<=480p`, `720p`, `1080p`, `1440p`, `2160p+`
- `input_size`, `output_size`: `<25MB`, `25-100MB`, `100-500MB`, `500MB-1GB`, `>1GB`
- `clip_length`: `<15s`, `15-60s`, `1-5min`, `5-20min`, `>20min`, `unknown`

Changing a bucket boundary breaks comparisons over time, so treat the buckets
as part of the schema.

`export_failed.category`:

| Category | Meaning |
|---|---|
| `engine_load` | The engine never became ready (any failure in the `engine` stage) |
| `timeout` | No progress for 60 s; the next attempt uses the single-threaded engine |
| `unsupported_format` | FFmpeg couldn't decode the input |
| `out_of_memory` | An allocation failed, or a `RangeError` |
| `encoder_crash` | A WASM trap in the encoder (`memory access out of bounds`, `unreachable`) |
| `network` | A network error after the engine started |
| `encode_error` | Any other FFmpeg failure |

### Guarantees (covered by tests)

- Every `export_started` is followed by at most one terminal event. A
  cancelled encode that rejects later, or a second Cancel click, adds nothing.
- A user cancellation is `export_cancelled`, never `export_failed`.
- After a failure, the next attempt on the same video has `is_retry: true` and
  `retry_after: <category>`. Choosing a new video, "Edit another" or clearing
  saved data resets this.
- Handled failures are logged with the `[reframe:handled]` prefix, and
  `beforeSend` drops RUM's automatic console-error copy, so a failure is
  counted once. Uncaught exceptions still reach RUM.
- An engine that can't start produces both `ffmpeg_load_failure` (engine
  reliability) and `export_failed` with `category: engine_load` (the export's
  outcome). They answer different questions; don't add them together.

### Older event names

Builds before this change send `export_start`, `export_success` and
`export_failure` (with a `reason` property instead of `category`), and
`ffmpeg_load_success` / `ffmpeg_load_failure` without `engine`. During the
transition, query both, for example
`@action.target.name:(export_success OR export_succeeded)`.

## Querying in Datadog

Custom actions sent with `addAction` are searched by
**`@action.target.name`**, not `@action.name`. For example:

```
@type:action service:reframe env:production @action.target.name:export_failed
```

Custom properties and the global context are under `@context.<name>`, for
example `@context.category:timeout` or `@context.format:gif`. Browser, OS and
device come from RUM itself: `@browser.name`, `@os.name`, `@device.type`.
Vitals are `@type:vital @vital.name:export`, with durations in nanoseconds.

The `@context.*` paths were checked against real events through the RUM
search API on 2026-11-03. Grouping by a `@context.*` attribute works in
queries and dashboards without creating a facet first; facets only make the
attribute show up in the RUM Explorer's side panel.

## What exists in Datadog

Created through the API on 2026-11-03 (site `datadoghq.com`):

| Item | ID |
|---|---|
| Dashboard "Reframe — export reliability" | [`2tw-pge-qkk`](https://app.datadoghq.com/dashboard/2tw-pge-qkk) |
| Monitor: exports failing in production (> 10 `export_failed` in 1 h; warning at 5) | `340137974` |
| Monitor: FFmpeg engine failing to load (> 5 `ffmpeg_load_failure` in 1 h) | `340138002` |
| Monitor: cross-origin isolation missing (> 3 loads with `single_reason:not_isolated` in 1 h) | `340138004` |
| Monitor: frontend errors spike (> 25 uncaught errors in 1 h) | `340138012` |

The monitors only watch `env:production`, never page anyone, and email the
maintainer. Their thresholds are absolute counts, chosen for today's low
traffic; revisit them once there are a few weeks of data.

The management keys live in the `DD_API_KEY` and `DD_APP_KEY` GitHub secrets
(and in a maintainer's gitignored `.env.local`). They are separate from the
browser's send-only client token. Never commit them.

## The dashboard

`docs/datadog/export-reliability.dashboard.json` is the source of the
dashboard above. If you change it, update the live dashboard to match (see
below, with `PUT /api/v1/dashboard/2tw-pge-qkk`).

What it shows (all for the `$env` template variable, default `production`):

- Export success rate, `succeeded / (succeeded + failed)`, with cancellations
  excluded, and the number of finished exports it is based on
- Outcomes over time, including cancellations
- Success rate by browser, device type, operating system, output format,
  output resolution and engine (multi- or single-threaded)
- GIF exports: success rate by device type
- Failure categories overall, by browser and by device type
- Where exports fail (engine start or encoding)
- How often a retry recovers
- Engine start failures by cause, and why loads ended single-threaded

Every success-rate table shows the sample size next to the rate. Ignore groups
with only a handful of finished exports: a browser with three exports and one
failure is not a 67% browser.

### Update it

To push a changed definition to the live dashboard, with the keys in your
environment (an application key with the `dashboards_write` scope):

```bash
curl -X PUT "https://api.datadoghq.com/api/v1/dashboard/2tw-pge-qkk" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  --data @docs/datadog/export-reliability.dashboard.json
```

Without keys, you can paste the file into Dashboards → New Dashboard → the
settings cog → **Import dashboard JSON** instead.

For filtering in the RUM Explorer, you can also create facets for
`context.format`, `context.resolution`, `context.engine`, `context.category`,
`context.stage`, `context.is_retry` and `context.single_reason` (open an
`export_failed` event → "Create facet"). The dashboard doesn't need them.

## Testing locally

- `bun run test` runs with the SDK mocked, and `vitest.setup.ts` fails any
  test that tries to contact Datadog.
- `DatadogInit.local.test.tsx` checks that RUM never starts on localhost,
  even with keys and `NEXT_PUBLIC_DATADOG_ENV=production`.
  `DatadogInit.production.test.tsx` and `DatadogInit.preview.test.tsx` load the
  page as the Netlify production and deploy-preview hosts.
- `exportTelemetry.hook.test.ts` drives the editor through failures, retries
  and cancellations and checks the events it sends.

## Known limitations

- A tab closed mid-export sends no terminal event. Those attempts show up only
  as `export_started` minus the three terminal events, and RUM may not flush a
  closing page's last events.
- Requests made inside the FFmpeg worker are invisible to RUM. Engine-load
  categories come from Reframe's own error text, so new browser wording can
  land in `unknown`.
- Rates depend on RUM's sampling (`sessionSampleRate: 100` today).
