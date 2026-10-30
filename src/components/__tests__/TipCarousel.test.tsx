import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TipCarousel from "../TipCarousel";

describe("TipCarousel Accessibility (WCAG 2.2.2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders with carousel region role and accessible label", () => {
    render(<TipCarousel />);
    const region = screen.getByRole("region", { name: "Workflow tips" });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
  });

  it("renders the first tip initially and exposes pagination indicators", () => {
    render(<TipCarousel />);
    expect(screen.getByText("100% Local Sandbox")).toBeInTheDocument();
    expect(screen.getByText("PRIVACY FIRST")).toBeInTheDocument();

    const dotButtons = screen.getAllByRole("button", { name: /Go to tip/i });
    expect(dotButtons).toHaveLength(5);
    expect(dotButtons[0]).toHaveAttribute("aria-current", "true");
    expect(dotButtons[1]).not.toHaveAttribute("aria-current");
  });

  it("auto-advances to the next tip every 6000ms when unpaused", () => {
    render(<TipCarousel />);
    expect(screen.getByText("100% Local Sandbox")).toBeInTheDocument();

    // Advance 6000ms for rotation interval, plus 300ms for fade transition
    act(() => {
      vi.advanceTimersByTime(6000);
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("Keep This Tab Active")).toBeInTheDocument();
  });

  it("pauses auto-rotation on mouse hover and resumes on mouse leave", () => {
    render(<TipCarousel />);
    const region = screen.getByRole("region", { name: "Workflow tips" });

    // Hover to pause
    fireEvent.mouseEnter(region);

    act(() => {
      vi.advanceTimersByTime(12000);
    });

    // Should stay on the first tip
    expect(screen.getByText("100% Local Sandbox")).toBeInTheDocument();

    // Mouse leave to resume
    fireEvent.mouseLeave(region);

    act(() => {
      vi.advanceTimersByTime(6000);
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("Keep This Tab Active")).toBeInTheDocument();
  });

  it("pauses auto-rotation on focus and resumes on blur", () => {
    render(<TipCarousel />);
    const region = screen.getByRole("region", { name: "Workflow tips" });

    // Focus into carousel
    fireEvent.focus(region);

    act(() => {
      vi.advanceTimersByTime(12000);
    });

    expect(screen.getByText("100% Local Sandbox")).toBeInTheDocument();

    // Blur out of carousel
    fireEvent.blur(region, { relatedTarget: document.body });

    act(() => {
      vi.advanceTimersByTime(6000);
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("Keep This Tab Active")).toBeInTheDocument();
  });

  it("toggles pause and play via the visible pause button", () => {
    render(<TipCarousel />);
    const pauseBtn = screen.getByRole("button", { name: /Pause auto-rotation/i });
    expect(pauseBtn).toHaveAttribute("aria-pressed", "false");

    // Click pause button
    fireEvent.click(pauseBtn);
    expect(pauseBtn).toHaveAttribute("aria-label", "Resume auto-rotation");
    expect(pauseBtn).toHaveAttribute("aria-pressed", "true");

    // Advancing time should not change tip
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(screen.getByText("100% Local Sandbox")).toBeInTheDocument();

    // Click resume button
    fireEvent.click(pauseBtn);
    expect(pauseBtn).toHaveAttribute("aria-label", "Pause auto-rotation");
    expect(pauseBtn).toHaveAttribute("aria-pressed", "false");

    act(() => {
      vi.advanceTimersByTime(6000);
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("Keep This Tab Active")).toBeInTheDocument();
  });

  it("jumps to selected tip when clicking a pagination dot", () => {
    render(<TipCarousel />);
    const thirdDot = screen.getByRole("button", { name: /Go to tip 3/i });

    fireEvent.click(thirdDot);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(thirdDot).toHaveAttribute("aria-current", "true");
  });

  it("initializes in paused state when prefers-reduced-motion is enabled", () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<TipCarousel />);
    const button = screen.getByRole("button", { name: /Resume auto-rotation/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "true");

    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(screen.getByText("100% Local Sandbox")).toBeInTheDocument();
  });
});
