"use client";

import { useEffect } from "react";
import { capabilityContext, currentTelemetryEnv, registerRum, sanitizeRumEvent } from "@/lib/telemetry";

export default function DatadogInit() {
  useEffect(() => {
    const applicationId = process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID;
    const clientToken = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;

    // null on localhost, LAN addresses and automated browsers unless
    // NEXT_PUBLIC_DATADOG_ENV names a non-production env (see telemetry.ts).
    const env = currentTelemetryEnv();
    if (!applicationId || !clientToken || !env) {
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
            env,
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
            // Strips the recipe query string, blob: previews, file names,
            // captions and local paths from automatically collected events.
            beforeSend: (event) => sanitizeRumEvent(event as Parameters<typeof sanitizeRumEvent>[0]),
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
