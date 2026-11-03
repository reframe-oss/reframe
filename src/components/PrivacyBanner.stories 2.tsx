import type { Meta, StoryObj } from "@storybook/nextjs";
import PrivacyBanner from "./PrivacyBanner";

/**
 * "Your video never leaves your device" banner above the upload area — a key
 * piece of the product's positioning, so its styling is worth protecting.
 *
 * It is dismissible and persists that choice, so it can render empty if
 * localStorage already holds a dismissal. Storybook gives each story a fresh
 * iframe, so the default (visible) state is what gets captured.
 */
const meta = {
  title: "Editor/PrivacyBanner",
  component: PrivacyBanner,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PrivacyBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
