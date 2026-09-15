import React from "react";
import { describe, beforeEach, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../ThemeProvider";
import { ThemeToggle } from "../ThemeToggle";

describe("KeyboardNavigation - ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("can be focused using Tab and activated using Space/Enter", async () => {
    const user = userEvent.setup();

    render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(ThemeToggle)
      )
    );

    const toggleButton = screen.getByRole("button", { name: /switch/i });
    expect(toggleButton).toBeTruthy();

    // Verify it is not initially focused
    expect(document.activeElement).not.toBe(toggleButton);

    // Tab to the button
    await user.tab();

    // Verify it is now focused
    expect(document.activeElement).toBe(toggleButton);

    // Toggle theme using Space key
    await user.keyboard(" ");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Toggle theme using Enter key
    await user.keyboard("{Enter}");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
