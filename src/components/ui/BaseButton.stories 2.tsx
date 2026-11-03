import type { Meta, StoryObj } from "@storybook/nextjs";
import BaseButton from "./BaseButton";

/**
 * The shared button used across the editor. Four variants times four sizes is
 * exactly the kind of combinatorial surface that regresses silently, so the
 * matrix story below captures all of it in a single snapshot.
 */
const meta = {
  title: "Design System/BaseButton",
  component: BaseButton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BaseButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary", children: "Export video" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Reset all" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Cancel" },
};

export const Outline: Story = {
  args: { variant: "outline", children: "Learn more" },
};

/** Marked active — used for selected presets and toggles. */
export const Active: Story = {
  args: { variant: "secondary", active: true, children: "9 : 16" },
};

export const Disabled: Story = {
  args: { variant: "primary", disabled: true, children: "Exporting…" },
};

/** Every variant/size combination in one snapshot. */
export const Matrix: Story = {
  render: () => {
    const variants = ["primary", "secondary", "ghost", "outline"] as const;
    const sizes = ["sm", "md", "lg", "xl"] as const;
    return (
      <div className="flex flex-col gap-4">
        {variants.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-3">
            <span className="w-20 text-xs uppercase tracking-wide text-[var(--muted)]">
              {variant}
            </span>
            {sizes.map((size) => (
              <BaseButton key={size} variant={variant} size={size}>
                {size}
              </BaseButton>
            ))}
          </div>
        ))}
      </div>
    );
  },
};
