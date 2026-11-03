import type { Meta, StoryObj } from "@storybook/nextjs";
import DownloadResult from "./DownloadResult";
import type { ExportResult } from "@/lib/types";

/**
 * Success panel shown after an export finishes: dimensions, file size, a
 * filename field and the download button.
 *
 * The ExportResult is synthesised rather than produced by a real export — a
 * genuine FFmpeg run would take ~30s and produce a different blob each time.
 * A small in-memory Blob exercises exactly the same render path.
 */
function makeResult(overrides: Partial<ExportResult> = {}): ExportResult {
  const blob = new Blob(["reframe-storybook-fixture"], { type: "video/mp4" });
  return {
    blobUrl: "about:blank",
    blob,
    size: 8_432_119,
    width: 1080,
    height: 1920,
    format: "mp4",
    dispose: () => {},
    ...overrides,
  };
}

const meta = {
  title: "Editor/Modals/DownloadResult",
  component: DownloadResult,
  parameters: { layout: "padded" },
  args: {
    onReset: () => {},
    onToggleSound: () => {},
    soundOnCompletion: false,
  },
} satisfies Meta<typeof DownloadResult>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A vertical 9:16 export, the most common output for this tool. */
export const Default: Story = {
  args: { result: makeResult() },
};

/** Landscape WebM, with the export-duration readout present. */
export const WithExportDuration: Story = {
  args: {
    result: makeResult({
      width: 1920,
      height: 1080,
      format: "webm",
      size: 24_908_311,
      exportDurationMs: 42_500,
    }),
  },
};

/** Completion sound enabled — toggles the speaker control's active state. */
export const SoundEnabled: Story = {
  args: { result: makeResult(), soundOnCompletion: true },
};

/** A GIF export: small, square, and audio-less. */
export const GifExport: Story = {
  args: {
    result: makeResult({
      format: "gif",
      width: 480,
      height: 480,
      size: 1_204_880,
    }),
  },
};
