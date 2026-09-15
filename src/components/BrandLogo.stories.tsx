import type { Meta, StoryObj } from "@storybook/nextjs";
import BrandLogo from "./BrandLogo";

/** Wordmark/logo used in the header and footer. */
const meta = {
  title: "Design System/BrandLogo",
  component: BrandLogo,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BrandLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Large: Story = { args: { size: 64 } };
export const Small: Story = { args: { size: 20 } };
