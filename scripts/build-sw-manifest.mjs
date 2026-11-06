#!/usr/bin/env node
// Lists the static export's files for the service worker (public/sw.js) to
// precache, so the editor opens offline. Runs after `next build`:
//
//   node scripts/build-sw-manifest.mjs [out]
//
// Writes { version, pages, assets } into out/sw.js in place of its
// placeholder. `version` is a hash of every listed file's contents, so a
// deploy that changes anything changes sw.js too: browsers then install the
// new worker, which precaches into a new cache and removes the old one.
// Source maps, the headers file and sw.js itself are left out.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = [/\.map$/, /^_headers$/, /^sw\.js$/, /(^|\/)\.DS_Store$/];
/** The line in public/sw.js that the build replaces. */
export const PLACEHOLDER = "const PRECACHE = null; // replaced at build time";
/** Error pages aren't opened directly, so they aren't precached as pages. */
const SKIP_PAGES = new Set(["404", "_not-found"]);

/**
 * Splits the export's files (paths relative to out/, with "/") into page
 * URLs ("index.html" → "/", "contact.html" → "/contact") and asset URLs.
 */
export function precacheList(files) {
  const pages = [];
  const assets = [];
  for (const file of [...files].sort()) {
    if (SKIP.some((re) => re.test(file))) continue;
    if (file.endsWith(".html") && !file.includes("/")) {
      const name = file.slice(0, -".html".length);
      if (SKIP_PAGES.has(name)) continue;
      pages.push(name === "index" ? "/" : `/${name}`);
      continue;
    }
    if (file.endsWith(".html")) continue;
    assets.push(`/${file}`);
  }
  return { pages, assets };
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
  );
  return files.flat();
}

export async function buildManifest(root) {
  const files = (await walk(root)).map((path) => relative(root, path).split(sep).join("/"));
  const list = precacheList(files);
  const hash = createHash("sha256");
  const included = new Set([...list.assets.map((a) => a.slice(1)), ...files.filter((f) => f.endsWith(".html"))]);
  for (const file of [...included].sort()) {
    hash.update(file);
    hash.update(await readFile(join(root, file)));
  }
  return { version: hash.digest("hex").slice(0, 16), ...list };
}

/** sw.js with the precache list in place of its placeholder. */
export function injectManifest(source, manifest) {
  if (!source.includes(PLACEHOLDER)) throw new Error("sw.js has no precache placeholder");
  return source.replace(PLACEHOLDER, `const PRECACHE = ${JSON.stringify(manifest)};`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // It rewrites out/sw.js, so it only works inside the repository it runs in.
  const root = resolve(process.argv[2] ?? "out");
  if (!root.startsWith(process.cwd() + sep)) {
    console.error(`build-sw-manifest: ${root} is outside ${process.cwd()}; refusing.`);
    process.exit(2);
  }
  const manifest = await buildManifest(root);
  const swPath = join(root, "sw.js");
  await writeFile(swPath, injectManifest(await readFile(swPath, "utf8"), manifest));
  console.log(`sw.js: ${manifest.pages.length} pages, ${manifest.assets.length} assets, version ${manifest.version}`);
}
