import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { precacheList, injectManifest, PLACEHOLDER } from "../../../scripts/build-sw-manifest.mjs";
import { engineFileUrls } from "../engineUrls";

const SOURCE = readFileSync(join(__dirname, "../../../public/sw.js"), "utf8");

type Route = (url: URL, request: { method: string; mode: string }) => string;

/** Runs sw.js against a stand-in `self`, as the browser would, and returns its test hooks. */
function loadWorker(precache: unknown) {
  const listeners: string[] = [];
  const self = {
    location: { origin: "https://reframe.test" },
    addEventListener: (type: string) => listeners.push(type),
  } as Record<string, unknown>;
  const source = precache ? injectManifest(SOURCE, precache) : SOURCE;
  new Function("self", "caches", source)(self, {});
  return { ...(self.__reframeSw as { route: Route; pageKey: (path: string) => string }), listeners };
}

const PRECACHE = { version: "abc", pages: ["/", "/contact", "/privacy"], assets: ["/_next/static/chunks/app.js"] };
const get = (mode = "cors") => ({ method: "GET", mode });

describe("precache list (scripts/build-sw-manifest.mjs)", () => {
  it("turns HTML files into page URLs and keeps everything else as assets", () => {
    const list = precacheList([
      "index.html",
      "contact.html",
      "privacy.html",
      "404.html",
      "_not-found.html",
      "contact/__next._tree.txt",
      "_next/static/chunks/app.js",
      "_next/static/chunks/app.js.map",
      "_headers",
      "sw.js",
      "fonts/Geist-Regular.ttf",
    ]);
    expect(list.pages).toEqual(["/contact", "/", "/privacy"]);
    expect(list.assets).toEqual(["/_next/static/chunks/app.js", "/contact/__next._tree.txt", "/fonts/Geist-Regular.ttf"]);
  });

  it("writes the list into sw.js in place of its placeholder", () => {
    expect(SOURCE).toContain(PLACEHOLDER);
    const built = injectManifest(SOURCE, PRECACHE);
    expect(built).not.toContain(PLACEHOLDER);
    expect(built).toContain('const PRECACHE = {"version":"abc"');
    expect(() => injectManifest("// no placeholder", PRECACHE)).toThrow(/placeholder/);
  });
});

describe("service worker routing (public/sw.js)", () => {
  const sw = loadWorker(PRECACHE);

  it("handles install, activate, fetch and update messages", () => {
    expect(sw.listeners).toEqual(expect.arrayContaining(["install", "activate", "fetch", "message"]));
  });

  it("keeps every engine file the page loads, in either mode", () => {
    for (const url of [...engineFileUrls(true), ...engineFileUrls(false)]) {
      expect(sw.route(new URL(url), get())).toBe("engine");
    }
  });

  it("serves the app's pages and files, and leaves everything else alone", () => {
    expect(sw.route(new URL("https://reframe.test/?preset=square"), get("navigate"))).toBe("page");
    expect(sw.route(new URL("https://reframe.test/_next/static/chunks/app.js"), get())).toBe("asset");
    expect(sw.route(new URL("https://reframe.test/sw.js"), get())).toBe("network");
    expect(sw.route(new URL("https://reframe.test/"), { method: "POST", mode: "cors" })).toBe("network");
    // Other sites (analytics, other CDN files) are never cached.
    expect(sw.route(new URL("https://browser-intake-datadoghq.com/api"), get())).toBe("network");
    expect(sw.route(new URL("https://cdn.jsdelivr.net/npm/other@1/x.js"), get())).toBe("network");
  });

  it("finds the cached page for a path, and the editor for anything unknown", () => {
    expect(sw.pageKey("/")).toBe("/");
    expect(sw.pageKey("/contact")).toBe("/contact");
    expect(sw.pageKey("/contact/")).toBe("/contact");
    expect(sw.pageKey("/privacy.html")).toBe("/privacy");
    expect(sw.pageKey("/index.html")).toBe("/");
    expect(sw.pageKey("/nope")).toBe("/");
  });

  it("does nothing for the app itself before a build has written the list", () => {
    const dev = loadWorker(null);
    expect(dev.route(new URL("https://reframe.test/"), get("navigate"))).toBe("network");
    expect(dev.route(new URL(engineFileUrls(false)[1]!), get())).toBe("engine");
  });
});
