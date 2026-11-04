"use client";

import { useEffect } from "react";
import { capabilityContext, currentTelemetryEnv, registerRum, sanitizeRumEvent } from "@/lib/telemetry";
import { analyticsAllowed } from "@/lib/analyticsConsent";

export default function DatadogInit() {
  useEffect(() => {
    const applicationId = process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID;
    const clientToken = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;

    // null on localhost, LAN addresses and automated browsers unless
    // NEXT_PUBLIC_DATADOG_ENV names a non-production env (see telemetry.ts).
    const env = currentTelemetryEnv();
    // Off in Settings, or the browser sends Do Not Track / Global Privacy
    // Control: don't load the SDK at all.
    if (!applicationId || !clientToken || !env || !analyticsAllowed()) {
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
            // The commit SHA (next.config.ts): errors and vitals group by release.
            version: process.env.NEXT_PUBLIC_RELEASE || "dev",
            sessionSampleRate: 100,
            // Off: session replay would visually record the editor (and the
            // video in the preview), which videos never leaving the device rules
            // out. Metrics and errors only.
            sessionReplaySampleRate: 0,
            // Replay is off; if it were ever enabled, text and inputs stay masked.
            defaultPrivacyLevel: "mask",
            // No persistent anonymous user ID (usr.anonymous_id): sessions
            // can't be linked across visits.
            trackAnonymousUser: false,
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
