"use client";

import { useEffect } from "react";
import { datadogRum } from "@datadog/browser-rum";
import { reactPlugin } from "@datadog/browser-rum-react";

export default function DatadogInit() {
  useEffect(() => {
    const applicationId = process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID;
    const clientToken = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;

    if (!applicationId || !clientToken) {
      return;
    }

    datadogRum.init({
      applicationId,
      clientToken,
      site: "datadoghq.com",
      service: "reframe",
      env: "production",
      version: "0.1.0",
      sessionSampleRate: 100,
      // Reframe advertises itself as 100% private client-side video editing —
      // session replay would visually record the editor UI, which cuts
      // against that claim. Metrics/errors only.
      sessionReplaySampleRate: 0,
      plugins: [reactPlugin()],
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
    });
  }, []);

  return null;
}
