#!/usr/bin/env node
// Deletes source maps from the static export before it is published.
//
// next.config.ts builds them (productionBrowserSourceMaps) so CI can upload
// them to Datadog for readable stack traces (.github/workflows/sourcemaps.yml),
// but they should never be served publicly: they would publish the original
// source with its comments. Netlify runs this after `bun run build`.
//
//   node scripts/strip-sourcemaps.mjs [dir]   (default: out)
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2] ?? "out";

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let removed = 0;
for await (const path of walk(root)) {
  if (path.endsWith(".map")) {
    await unlink(path);
    removed++;
  }
}
console.log(`strip-sourcemaps: removed ${removed} source map(s) from ${root}/`);
