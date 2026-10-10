import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageOverlayPanel from "../ImageOverlay";
import TextControls from "../TextControls";
import { DEFAULT_RECIPE } from "../../lib/constants";
import { createDefaultTextOverlay } from "../../lib/text-overlay";
import type { OverlayPosition } from "../../lib/types";

const positions = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
const sizes = ["Small", "Medium", "Large"];
const opacities = ["25%", "60%", "100%"];
const weights = ["Normal", "Bold", "Heavy"];

function ImageHarness({ size = 100, opacity = 100 }: { size?: number; opacity?: number }) {
  const [file, setFile] = useState<File | null>(
    () => new File(["image"], "overlay.png", { type: "image/png" })
  );
  const [position, setPosition] = useState<OverlayPosition>("top-left");
  const [currentSize, setSize] = useState(size);
  const [currentOpacity, setOpacity] = useState(opacity);
  return (
    <ImageOverlayPanel
      overlayFile={file}
      setOverlayFile={setFile}
      overlayPosition={position}
      setOverlayPosition={setPosition}
      overlaySize={currentSize}
      setOverlaySize={setSize}
      overlayOpacity={currentOpacity}
      setOverlayOpacity={setOpacity}
    />
  );
}

function TextHarness() {
  const [recipe, setRecipe] = useState(() => ({
    ...DEFAULT_RECIPE,
    textOverlays: [
      { ...createDefaultTextOverlay(), id: "first", text: "First overlay" },
      {
        ...createDefaultTextOverlay(),
        id: "second",
        text: "Second overlay",
        fontWeight: "900" as const,
      },
    ],
  }));
  const [selected, setSelected] = useState<string | null>("first");
  return (
    <TextControls
      recipe={recipe}
      onChange={(patch) => setRecipe((prev) => ({ ...prev, ...patch }))}
      selectedTextId={selected}
      onSelectText={setSelected}
    />
  );
}

function expectSelection(names: readonly string[], selected: string) {
  for (const name of names) {
    expect(screen.getByRole("button", { name })).toHaveAttribute(
      "aria-pressed",
      String(name === selected)
    );
  }
}

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:overlay");
      static revokeObjectURL = vi.fn();
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("image overlay preset accessibility", () => {
  it("names every position and updates its pressed state after selection", async () => {
    const user = userEvent.setup();
    render(<ImageHarness />);
    const names = positions.map((position) => `Position overlay at ${position.replace("-", " ")}`);
    expectSelection(names, "Position overlay at top left");
    for (const name of [...names.slice(1), "Position overlay at top left"]) {
      await user.click(screen.getByRole("button", { name }));
      expectSelection(names, name);
    }
  });

  it.each([
    ["size", sizes, "Small"],
    ["opacity", opacities, "100%"],
  ] as const)(
    "updates all %s pressed states when a preset changes",
    async (_group, names, initial) => {
      const user = userEvent.setup();
      render(<ImageHarness />);
      expectSelection(names, initial);
      for (const name of names) {
        await user.click(screen.getByRole("button", { name }));
        expectSelection(names, name);
      }
    }
  );

  it.each([
    [100, "Small"],
    [150, "Small"],
    [151, "Medium"],
    [250, "Medium"],
    [300, "Medium"],
    [301, "Large"],
    [450, "Large"],
  ])("matches the highlighted size range at %s", (size, selected) => {
    render(<ImageHarness size={Number(size)} />);
    expectSelection(sizes, String(selected));
  });

  it.each([
    [0, "25%"],
    [25, "25%"],
    [35, "25%"],
    [36, "60%"],
    [60, "60%"],
    [75, "60%"],
    [76, "100%"],
    [100, "100%"],
  ])("matches the highlighted opacity range at %s", (opacity, selected) => {
    render(<ImageHarness opacity={Number(opacity)} />);
    expectSelection(opacities, String(selected));
  });

  it("supports keyboard activation and removes presets when the image is removed", async () => {
    const user = userEvent.setup();
    render(<ImageHarness />);
    screen.getByRole("button", { name: "Small" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Medium" })).toHaveFocus();
    await user.keyboard(" ");
    expectSelection(sizes, "Medium");
    await user.tab();
    await user.keyboard("{Enter}");
    expectSelection(sizes, "Large");
    await user.click(screen.getByRole("button", { name: "Remove overlay image" }));
    expect(screen.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
  });
});

describe("font weight preset accessibility", () => {
  it("updates pressed states on click and follows the selected text overlay", async () => {
    const user = userEvent.setup();
    render(<TextHarness />);
    expectSelection(weights, "Normal");
    for (const name of ["Bold", "Heavy", "Normal"]) {
      await user.click(screen.getByRole("button", { name }));
      expectSelection(weights, name);
    }
    await user.click(screen.getByRole("button", { name: "Second overlay" }));
    expectSelection(weights, "Heavy");
    await user.click(screen.getByRole("button", { name: "First overlay" }));
    expectSelection(weights, "Normal");
  });

  it("supports Tab, Space and Enter without changing selection on focus", async () => {
    const user = userEvent.setup();
    render(<TextHarness />);
    screen.getByRole("button", { name: "Normal" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Bold" })).toHaveFocus();
    expectSelection(weights, "Normal");
    await user.keyboard(" ");
    expectSelection(weights, "Bold");
    await user.tab();
    await user.keyboard("{Enter}");
    expectSelection(weights, "Heavy");
  });
});
