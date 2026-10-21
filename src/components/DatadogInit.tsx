"use client";

import { useEffect } from "react";
import { capabilityContext, registerRum } from "@/lib/telemetry";

/** Strip query strings: Reframe mirrors editing settings into the URL. */
function stripQuery(url: string | undefined): string | undefined {
  if (!url) return url;
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

export default function DatadogInit() {
  useEffect(() => {
    const applicationId = process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID;
    const clientToken = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;

    if (!applicationId || !clientToken) {
      return;
    }

    let cancelled = false;

    // The SDK isn't needed for first paint, so it loads as a separate chunk
    // once the browser is idle. RUM still captures the initial view's
    // FCP/LCP/CLS from buffered performance entries.
    const start = () => {
      Promise.all([import("@datadog/browser-rum"), import("@datadog/browser-rum-react")])
        .then(([{ datadogRum }, { reactPlugin }]) => {
          if (cancelled) return;
          datadogRum.init({
            applicationId,
            clientToken,
            site: "datadoghq.com",
            service: "reframe",
            // Lets local/preview measurements be separated from production.
            env: process.env.NEXT_PUBLIC_DATADOG_ENV || "production",
            version: "0.1.0",
            sessionSampleRate: 100,
            // Reframe advertises itself as 100% private client-side video editing —
            // session replay would visually record the editor UI, which cuts
            // against that claim. Metrics/errors only.
            sessionReplaySampleRate: 0,
            plugins: [reactPlugin()],
            trackUserInteractions: true,
            // Auto-named click actions use the clicked element's text, which can
            // include the uploaded file's name. Mask them; custom actions keep names.
            enablePrivacyForActionName: true,
            trackResources: true,
            trackLongTasks: true,
            beforeSend: (event) => {
              // The editor mirrors recipe settings into the query string, and
              // previews are blob: URLs — neither should leave the device.
              if (event.view) {
                event.view.url = stripQuery(event.view.url) ?? event.view.url;
                event.view.referrer = stripQuery(event.view.referrer);
              }
              if (event.type === "resource" && event.resource.url.startsWith("blob:")) {
                return false;
              }
              return true;
            },
          });
          datadogRum.setGlobalContext(capabilityContext());
          registerRum(datadogRum);
        })
        .catch(() => {
          // Telemetry is optional; never surface a failure to the user.
        });
    };

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 4000 })
      : window.setTimeout(start, 1500);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  return null;
}
