import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import HistoryControls from "../HistoryControls";
import ProjectPanel, { RecoveryNotice } from "../ProjectPanel";
import { MAX_PROJECT_FILE_BYTES } from "@/lib/project";

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

function renderPanel(overrides: Partial<React.ComponentProps<typeof ProjectPanel>> = {}) {
  const props = {
    hasFile: true,
    storageStatus: { savedAt: null, sourceCopy: "saved" as const, error: null },
    onBuildProjectFile: vi.fn(() => ({ fileName: "clip.reframe.json", contents: "{}" })),
    onImportProject: vi.fn(() => ({ ok: true as const, message: "Project opened and applied to this video." })),
    onDeleteSavedData: vi.fn(),
    ...overrides,
  };
  const view = render(<ProjectPanel {...props} />);
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { props, input };
}

describe("ProjectPanel", () => {
  it("says what is stored and that nothing is uploaded", () => {
    renderPanel();
    expect(screen.getByText(/Nothing is uploaded/)).toBeInTheDocument();
    expect(screen.getByText(/copy of the video is kept in this browser/)).toBeInTheDocument();
  });

  it("warns when the video copy could not be stored", () => {
    renderPanel({ storageStatus: { savedAt: null, sourceCopy: "failed", error: null } });
    expect(screen.getByText(/asked to choose it again/)).toBeInTheDocument();
  });

  it("asks for confirmation before deleting saved data", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /delete saved data/i }));
    expect(props.onDeleteSavedData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /delete saved data/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDeleteSavedData).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Saved data deleted/)).toBeInTheDocument();
  });

  it("opens a project file and reports the outcome", async () => {
    const { props, input } = renderPanel();
    const file = new File(['{"format":"reframe-project"}'], "p.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(props.onImportProject).toHaveBeenCalledWith('{"format":"reframe-project"}'));
    expect(await screen.findByText("Project opened and applied to this video.")).toBeInTheDocument();
  });

  it("shows why a project was rejected", async () => {
    const { input } = renderPanel({
      onImportProject: vi.fn(() => ({ ok: false as const, error: "This file is not a Reframe project." })),
    });
    fireEvent.change(input, { target: { files: [new File(["[]"], "p.json")] } });
    expect(await screen.findByText(/Couldn't open the project. This file is not a Reframe project./)).toBeInTheDocument();
  });

  it("refuses an oversized file without reading it", async () => {
    const { props, input } = renderPanel();
    const big = new File(["x"], "big.json");
    Object.defineProperty(big, "size", { value: MAX_PROJECT_FILE_BYTES + 1 });
    const text = vi.spyOn(big, "text");
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/too large/)).toBeInTheDocument();
    expect(text).not.toHaveBeenCalled();
    expect(props.onImportProject).not.toHaveBeenCalled();
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
