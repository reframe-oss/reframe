// Whether this browser may send anonymous telemetry (Datadog RUM).
//
// - The viewer's own choice, from Settings (the privacy page), is stored in
//   localStorage under ANALYTICS_STORAGE_KEY.
// - Do Not Track and Global Privacy Control turn it off, and the toggle can't
//   turn it back on: the browser-wide signal wins.
// - With no choice and no signal, it is on (anonymous, see docs/DATADOG.md).
//
// When it is off RUM never initialises; if the viewer turns it off on a page
// where RUM already started, every further event is dropped in beforeSend.

export const ANALYTICS_STORAGE_KEY = "reframe_analytics";
const CHANGE_EVENT = "reframe:analytics-change";

type Nav = Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };

/** True when the browser asks not to be tracked (Do Not Track or GPC). */
export function browserDeclinesTracking(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Nav;
  const win = typeof window !== "undefined" ? (window as Window & { doNotTrack?: string }) : undefined;
  const dnt = nav.doNotTrack ?? win?.doNotTrack ?? nav.msDoNotTrack;
  return dnt === "1" || dnt === "yes" || nav.globalPrivacyControl === true;
}

/** The viewer's stored choice, or null if they haven't made one. */
export function storedAnalyticsChoice(): boolean | null {
  try {
    const value = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (value === "on") return true;
    if (value === "off") return false;
  } catch {
    // storage blocked: no stored choice
  }
  return null;
}

/** Whether telemetry may be sent from this browser right now. */
export function analyticsAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (browserDeclinesTracking()) return false;
  return storedAnalyticsChoice() ?? true;
}

/** Saves the viewer's choice. Returns false if it couldn't be stored. */
export function setAnalyticsChoice(enabled: boolean): boolean {
  let saved = true;
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    saved = false;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  return saved;
}

/** Calls `listener` when the choice changes in this tab or another one. */
export function onAnalyticsChoiceChange(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === ANALYTICS_STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
