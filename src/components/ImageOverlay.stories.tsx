import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import ImageOverlayPanel from "./ImageOverlay";
import type { OverlayPosition } from "../lib/types";

function ImageOverlayStory({ withImage = true }: { withImage?: boolean }) {
  const [file, setFile] = useState<File | null>(() =>
    withImage
      ? new File(
          [
            Uint8Array.from(
              atob(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="
              ),
              (char) => char.charCodeAt(0)
            ),
          ],
          "overlay.png",
          { type: "image/png" }
        )
      : null
  );
  const [position, setPosition] = useState<OverlayPosition>("bottom-right");
  const [size, setSize] = useState(150);
  const [opacity, setOpacity] = useState(75);
  return (
    <ImageOverlayPanel
      overlayFile={file}
      setOverlayFile={setFile}
      overlayPosition={position}
      setOverlayPosition={setPosition}
      overlaySize={size}
      setOverlaySize={setSize}
      overlayOpacity={opacity}
      setOverlayOpacity={setOpacity}
    />
  );
}

const meta = {
  title: "Editor/Controls/ImageOverlay",
  component: ImageOverlayStory,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ImageOverlayStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const SelectPresets: Story = {};
export const NoImage: Story = { args: { withImage: false } };
