import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import HistoryControls from "../HistoryControls";
import { RecoveryNotice } from "../RecoveryNotice";

describe("HistoryControls", () => {
  it("reflects availability in the disabled state", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<HistoryControls canUndo canRedo={false} onUndo={onUndo} onRedo={onRedo} />);
    const undo = screen.getByRole("button", { name: /undo/i });
    const redo = screen.getByRole("button", { name: /redo/i });
    expect(undo).toBeEnabled();
    expect(redo).toBeDisabled();
    fireEvent.click(undo);
    fireEvent.click(redo);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });
});

describe("RecoveryNotice", () => {
  it("names the file to choose and offers to discard", () => {
    const onDiscard = vi.fn();
    render(
      <RecoveryNotice
        recovery={{
          origin: "session",
          source: { name: "clip.mp4", size: 2048, type: "video/mp4", lastModified: 0, duration: 75, width: 1, height: 1 },
        }}
        onDiscard={onDiscard}
      />
    );
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByText(/1:15/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /discard saved edits/i }));
    expect(onDiscard).toHaveBeenCalled();
  });
});
