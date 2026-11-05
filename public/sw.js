/* Reframe service worker: opens the editor offline.
 *
 * - The app's own files are precached on install from PRECACHE, which
 *   scripts/build-sw-manifest.mjs writes into the built copy of this file.
 *   Pages are fetched from the network first (so a deploy shows at once) and
 *   from the cache when offline; other files come from the cache first.
 * - The video engine (FFmpeg core files on jsDelivr) is kept in its own
 *   cache the first time it downloads, and served from there after. They are
 *   CORS responses, so the browser still checks their SRI hashes.
 * - A cached page keeps the headers it was served with, including the
 *   cross-origin isolation ones (COOP/COEP), so the multi-threaded engine
 *   works offline wherever it works online.
 * - User videos and exports are never cached: they are blob: URLs, which
 *   never reach a service worker.
 */
const PRECACHE = null; // replaced at build time

const APP_CACHE_PREFIX = "reframe-app-";
const ENGINE_CACHE = "reframe-engine-v1";
const ENGINE_URLS = ["https://cdn.jsdelivr.net/npm/@ffmpeg/core@", "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@"];
/** How long a page request waits for the network before using the cache. */
const PAGE_TIMEOUT_MS = 4000;

const appCache = PRECACHE ? `${APP_CACHE_PREFIX}${PRECACHE.version}` : null;

/** What to do with a request: "engine", "page", "asset" or "network" (leave it alone). */
function route(url, request) {
  if (request.method !== "GET") return "network";
  if (ENGINE_URLS.some((prefix) => url.href.startsWith(prefix))) return "engine";
  if (url.origin !== self.location.origin || !appCache) return "network";
  if (request.mode === "navigate") return "page";
  if (url.pathname === "/sw.js") return "network";
  return "asset";
}

/** The precached page for a path: "/contact/" and "/contact.html" are "/contact"; unknown paths get "/". */
function pageKey(pathname) {
  const path = pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
  const name = path === "/index" ? "/" : path;
  return PRECACHE.pages.includes(name) ? name : "/";
}

async function page(request, url) {
  const cached = () => caches.open(appCache).then((cache) => cache.match(pageKey(url.pathname)));
  try {
    const network = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), PAGE_TIMEOUT_MS)),
    ]);
    return network;
  } catch (error) {
    const hit = await cached();
    if (hit) return hit;
    throw error;
  }
}

async function asset(request) {
  const cache = await caches.open(appCache);
  // Next's page data requests carry a ?_rsc= query; the file is the same.
  const hit = await cache.match(request, { ignoreSearch: true });
  return hit ?? fetch(request);
}

async function engine(request) {
  const cache = await caches.open(ENGINE_CACHE);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "cors") {
    await cache.put(request.url, response.clone());
    // The page checks whether every file it needs is in now.
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: "engine-cached" }));
  }
  return response;
}

self.addEventListener("install", (event) => {
  if (!appCache) return;
  event.waitUntil(
    caches
      .open(appCache)
      .then((cache) => cache.addAll([...PRECACHE.pages, ...PRECACHE.assets].map((url) => new Request(url, { cache: "reload" }))))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(APP_CACHE_PREFIX) && key !== appCache).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// The page asks for this when the user chooses to load an update.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const kind = route(url, event.request);
  if (kind === "engine") event.respondWith(engine(event.request));
  else if (kind === "page") event.respondWith(page(event.request, url));
  else if (kind === "asset") event.respondWith(asset(event.request));
});

// For tests (test code reads these; the browser ignores them).
self.__reframeSw = { route, pageKey, ENGINE_CACHE, APP_CACHE_PREFIX };
