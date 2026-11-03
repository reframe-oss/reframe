import type { Meta, StoryObj } from "@storybook/nextjs";
import Skeleton from "./Skeleton";

/**
 * Loading placeholder. Its shimmer is a CSS animation, which .storybook/preview.css
 * freezes so Chromatic captures a settled frame instead of a random one.
 */
const meta = {
  title: "Design System/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = { args: { className: "h-4 w-64" } };

export const Block: Story = { args: { className: "h-32 w-full max-w-md" } };

/** A realistic cluster, as used while thumbnails load. */
export const Group: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-24 w-full" />
    </div>
  ),
};
