# Deploying Reframe

Reframe is a static site: `bun run build` exports it to `out/`
(`output: "export"` in `next.config.ts`). There is no server to run.

The live site is on **Netlify** (https://reframe-os.netlify.app). Netlify is
the only host the project maintains; the other options below work for your
own fork.

## Cross-origin isolation: the one requirement

FFmpeg's fast multi-threaded engine needs `SharedArrayBuffer`, which browsers
only allow on a page that is cross-origin isolated. The host must send these
headers on every page:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them Reframe still works, but every export uses the single-threaded
engine and is several times slower. With them, any image, script or font
loaded from another origin must allow it (CORP or CORS); that's why the
Netlify badge and brand logos are served from this site instead of hotlinked.

Check a deployment with:

```bash
node scripts/deploy/check-deploy.mjs https://your-site.example [--expect-commit <sha>]
```

It requests the page, a hashed script, the preloaded font, the FFmpeg worker
chunk, the engine's WASM on jsDelivr, the trailing-slash redirect and a 404,
and checks the headers, MIME types and caching on each. With
`--expect-commit`, it also checks that the site serves that commit (each
build stamps it in `<meta name="reframe-build">`), which catches a stale
deploy. It exits 0 when everything passes, 1 on a failure, 3 when the
deployment needs a login and 4 when it can't be reached. In the browser
console on the site, `crossOriginIsolated` should be `true`.

`deploy-smoke.yml` runs this check on every pull request against a local
build, and against each Netlify deploy preview once Netlify reports it
ready.

## The other headers

Every host sends the same set (`netlify.toml`, `public/_headers` and
`vercel.json`, kept identical by `src/lib/tests/deployConfig.test.ts`):

- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy` and `Permissions-Policy` (no camera, microphone or
  location).
- `Cross-Origin-Resource-Policy: same-origin`: other sites can't embed
  Reframe's files.
- `Content-Security-Policy: base-uri 'self'; object-src 'none';
  frame-ancestors 'none'; form-action 'self'`. It has no fetch directives,
  so it can't block the FFmpeg cores or analytics; it stops framing,
  plugins, `<base>` hijacking and off-site form posts.
- `Cache-Control: public, max-age=31536000, immutable` on `/_next/static/*`,
  whose file names change with their content. Pages are revalidated on
  every visit.

## Netlify (recommended)

`netlify.toml` in the repository already sets the build, the publish
directory and the headers.

1. Fork the repository.
2. In Netlify, **Add new site → Import an existing project** and pick your fork.
3. Netlify reads `netlify.toml`:
   - build command: `bun install && bun run build`
   - publish directory: `out`
   - headers: COOP/COEP and the security headers
4. Deploy. Pull requests get deploy previews automatically.

Optional environment variables (Site settings → Environment variables):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_DATADOG_APPLICATION_ID`, `NEXT_PUBLIC_DATADOG_CLIENT_TOKEN` | Datadog RUM. Leave unset for no telemetry. See [DATADOG.md](DATADOG.md) |
| `NEXT_PUBLIC_DATADOG_ENV` | Override the telemetry environment, or `off` |

Netlify's own `CONTEXT` variable tells the build whether it is production or a
preview; `next.config.ts` passes it to the app so previews never report as
production.

### Netlify CLI

```bash
bun install
NEXT_PUBLIC_DATADOG_ENV=off bun run build
npx netlify-cli deploy --dir out          # draft URL
npx netlify-cli deploy --dir out --prod   # production (maintainers only)
```

## Other static hosts

| Host | Headers | Notes |
|---|---|---|
| Cloudflare Pages | Already handled: `public/_headers` is copied to `out/_headers`, which Cloudflare Pages reads too | Build: `bun run build`, output: `out` |
| Vercel | `vercel.json` in the repository sets the same headers | Framework preset Next.js, build `bun run build`. Not maintained by the project |
| GitHub Pages | **Not possible**: GitHub Pages can't send custom headers | Works, single-threaded only |
| Any static server | Configure COOP/COEP on the server | `scripts/serve-isolated.mjs` is a small example used by the tests |

## Checking a build locally

```bash
NEXT_PUBLIC_DATADOG_ENV=off bun run build
node scripts/serve-isolated.mjs        # http://127.0.0.1:4173, isolated
ISOLATED=0 node scripts/serve-isolated.mjs 4174   # without isolation
```
