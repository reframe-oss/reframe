// Shared by the DatadogInit tests, which differ only in the page URL (set per
// file with @vitest-environment-options, since jsdom's location is fixed).
import { render } from "@testing-library/react";
import { vi } from "vitest";

export const rumInit = vi.fn();

vi.mock("@datadog/browser-rum", () => ({
  datadogRum: { init: rumInit, setGlobalContext: vi.fn(), addAction: vi.fn(), addDurationVital: vi.fn(), addTiming: vi.fn() },
}));
vi.mock("@datadog/browser-rum-react", () => ({ reactPlugin: () => ({ name: "react" }) }));

/** Renders DatadogInit and waits past its idle-time start. Returns network calls seen. */
export async function renderDatadogInit() {
  rumInit.mockClear();
  const requests: string[] = [];
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    requests.push(String(input instanceof Request ? input.url : input));
    return new Response("");
  });
  const beacon = vi.fn((url: string) => {
    requests.push(url);
    return true;
  });
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  const open = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(function (_m: string, url: string | URL) {
    requests.push(String(url));
  });

  const { default: DatadogInit } = await import("../DatadogInit");
  const view = render(<DatadogInit />);
  // DatadogInit starts on requestIdleCallback, or after 1.5 s without it.
  await new Promise((r) => setTimeout(r, 1700));
  view.unmount();
  fetchSpy.mockRestore();
  open.mockRestore();
  return requests;
}
