import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AnalyticsSettings from "../AnalyticsSettings";
import { ANALYTICS_STORAGE_KEY } from "@/lib/analyticsConsent";

const setDnt = (value: string | null) =>
  Object.defineProperty(navigator, "doNotTrack", { configurable: true, get: () => value });

beforeEach(() => {
  localStorage.clear();
  setDnt(null);
});

describe("AnalyticsSettings", () => {
  it("is an accessible switch that saves the choice in this browser", async () => {
    render(<AnalyticsSettings />);
    const toggle = await screen.findByRole("switch", { name: "Anonymous analytics" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(localStorage.getItem(ANALYTICS_STORAGE_KEY)).toBe("off");
    expect(screen.getByRole("status")).toHaveTextContent(/off/i);

    fireEvent.click(toggle);
    expect(localStorage.getItem(ANALYTICS_STORAGE_KEY)).toBe("on");
  });

  it("shows off and can't be turned on when the browser sends Do Not Track", async () => {
    setDnt("1");
    render(<AnalyticsSettings />);
    const toggle = await screen.findByRole("switch", { name: "Anonymous analytics" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/Do Not Track/)).toBeInTheDocument();
  });
});
