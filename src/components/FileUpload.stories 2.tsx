import type { Meta, StoryObj } from "@storybook/nextjs";
import FileUpload from "./FileUpload";

/**
 * The drag-and-drop landing state — the first thing every user sees, and the
 * only screen shown until a file is chosen. Worth snapshotting in both themes.
 *
 * `currentFile` stays null across these stories: the "file selected" branch
 * reads File.name/size and renders a duration that arrives asynchronously from
 * media metadata, which would not be reproducible in CI.
 */
const meta = {
  title: "Editor/FileUpload",
  component: FileUpload,
  parameters: { layout: "padded" },
  args: {
    onFileSelect: () => {},
    currentFile: null,
    fileError: "",
    duration: 0,
  },
} satisfies Meta<typeof FileUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty drop zone awaiting a file. */
export const Empty: Story = {};

/** Rejected file — checks the error styling and that layout doesn't jump. */
export const WithError: Story = {
  args: {
    fileError: "That file is 3.2 GB. The maximum supported size is 2 GB.",
  },
};

/** An unsupported-format rejection, which is the more common failure. */
export const UnsupportedFormat: Story = {
  args: {
    fileError: "Unsupported file type. Please choose an MP4, WebM or MOV file.",
  },
};
