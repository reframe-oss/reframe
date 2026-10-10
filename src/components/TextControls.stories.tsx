import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import TextControls from "./TextControls";
import { RecipeHarness, makeRecipe } from "./__stories__/RecipeHarness";

function TextControlsStory() {
  const [selected, setSelected] = useState<string | null>("sample-text");
  return (
    <RecipeHarness
      initial={makeRecipe({
        textOverlays: [
          {
            id: "sample-text",
            text: "Sample title",
            x: 50,
            y: 20,
            fontSize: 48,
            color: "#ffffff",
            fontWeight: "normal",
            fontFamily: "Arial",
          },
        ],
      })}
    >
      {(recipe, onChange) => (
        <TextControls
          recipe={recipe}
          onChange={onChange}
          selectedTextId={selected}
          onSelectText={setSelected}
        />
      )}
    </RecipeHarness>
  );
}

const meta = {
  title: "Editor/Controls/TextControls",
  component: TextControlsStory,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TextControlsStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const SelectFontWeight: Story = {};
