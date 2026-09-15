import type { Meta, StoryObj } from "@storybook/nextjs";
import { Card, Button, Input, Badge } from "./components";

/**
 * The shared primitives every other screen is built from. These are the
 * highest-value stories in the project for visual regression: a change to a
 * design token (--bg, --surface, --border, --text, --muted, --accent) shows up
 * here first, and CLAUDE.md calls out renaming those variables as a breaking
 * change. One diff on this page localises the blast radius immediately.
 */
const meta = {
  title: "Design System/Primitives",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every button variant side by side, plus the disabled state. */
export const Buttons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Export video</Button>
      <Button variant="secondary">Reset all</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="primary" disabled>
        Exporting…
      </Button>
    </div>
  ),
};

/** All badge variants — these carry status colour, so contrast matters. */
export const Badges: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge label="Default" />
      <Badge label="Ready" variant="success" />
      <Badge label="Large file" variant="warning" />
      <Badge label="Failed" variant="error" />
    </div>
  ),
};

/** Text input, including the focus-visible outline globals.css defines. */
export const Inputs: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-3">
      <Input placeholder="reframe_1080x1920" />
      <Input defaultValue="my-clip" />
      <Input placeholder="Disabled" disabled />
    </div>
  ),
};

/** Card container with and without a description and body content. */
export const Cards: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card title="Preset" description="Choose an output aspect ratio.">
        <p className="text-sm text-[var(--muted)]">9 : 16 — 1080 × 1920</p>
      </Card>
      <Card title="Title only" />
    </div>
  ),
};

/** Everything together, which is how these actually appear in the editor. */
export const Kitchensink: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Button variant="primary">Export</Button>
        <Button variant="secondary">Reset</Button>
        <Button variant="ghost">Cancel</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Badge label="Default" />
        <Badge label="Ready" variant="success" />
        <Badge label="Large file" variant="warning" />
        <Badge label="Failed" variant="error" />
      </div>
      <Card title="Export settings" description="Quality and container format.">
        <Input placeholder="Filename" />
      </Card>
    </div>
  ),
};
