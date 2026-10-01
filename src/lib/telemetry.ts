import { datadogRum } from "@datadog/browser-rum";

// Custom Datadog RUM actions. Only coarse, non-identifying metrics are sent —
// never file names, contents, or recipe values (Reframe is privacy-first).
// No-op when RUM isn't configured (see DatadogInit).
const enabled = () =>
  typeof window !== "undefined" &&
  Boolean(process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID && process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN);

export function trackAction(name: string, context?: Record<string, string | number | boolean>) {
  if (!enabled()) return;
  try {
    datadogRum.addAction(name, context);
  } catch {
    // Telemetry must never break the editor.
  }
}

export function trackTiming(name: string) {
  if (!enabled()) return;
  try {
    datadogRum.addTiming(name);
  } catch {
    // ignore
  }
}
