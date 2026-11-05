"use client";

import { useCallback, useEffect, useState } from "react";
import { trackFeature } from "@/lib/featureTelemetry";
import { engineFileUrls } from "@/lib/engineUrls";

/** Must match ENGINE_CACHE in public/sw.js. */
const ENGINE_CACHE = "reframe-engine-v1";
const REPORTED_KEY = "reframe:offline-ready-reported";

export type OfflineState =
  /** No service worker (unsupported, or a development build). */
  | "unavailable"
  /** The app is being saved for offline use. */
  | "preparing"
  /** The app is saved, but the video engine hasn't been downloaded yet. */
  | "needs-engine"
  /** The editor and the engine both open offline. */
  | "ready";

async function engineCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(ENGINE_CACHE);
    const cached = new Set((await cache.keys()).map((request) => request.url));
    return engineFileUrls(self.crossOriginIsolated === true).every((url) => cached.has(url));
  } catch {
    return false;
  }
}

/**
 * Registers the service worker (production builds only) and reports whether
 * the editor works offline yet. When a new version has been installed,
 * `updateReady` is true and `applyUpdate` switches to it and reloads; it
 * never reloads on its own, so it can't interrupt an export.
 */
export function useOfflineSupport() {
  const [state, setState] = useState<OfflineState>("unavailable");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const sw = navigator.serviceWorker;

    const refresh = async () => {
      if (cancelled) return;
      if (!sw.controller) {
        setState("preparing");
        return;
      }
      const ready = await engineCached();
      if (cancelled) return;
      setState(ready ? "ready" : "needs-engine");
      if (ready) {
        try {
          if (!localStorage.getItem(REPORTED_KEY)) {
            localStorage.setItem(REPORTED_KEY, "1");
            trackFeature("pwa", "offline_ready");
          }
        } catch {
          // storage blocked: report nothing
        }
      }
    };

    const watch = (registration: ServiceWorkerRegistration) => {
      // A worker waiting while another controls the page is an update.
      if (registration.waiting && sw.controller) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && sw.controller) setWaiting(installing);
          if (installing.state === "activated") void refresh();
        });
      });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "engine-cached") void refresh();
    };
    const onControllerChange = () => void refresh();
    const onInstalled = () => trackFeature("pwa", "installed");

    sw.addEventListener("message", onMessage);
    sw.addEventListener("controllerchange", onControllerChange);
    window.addEventListener("appinstalled", onInstalled);
    sw.register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (!cancelled) watch(registration);
        return refresh();
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });

    return () => {
      cancelled = true;
      sw.removeEventListener("message", onMessage);
      sw.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waiting) return;
    trackFeature("pwa", "update");
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "skip-waiting" });
  }, [waiting]);

  return { state, updateReady: waiting !== null, applyUpdate, dismissUpdate: () => setWaiting(null) };
}
