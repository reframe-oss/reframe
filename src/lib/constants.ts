import type { EditRecipe } from "./types"
import { RECIPE_VERSION } from "./types"

export const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;

export const DEFAULT_RECIPE: EditRecipe = {
  preset: "vertical-9-16",
  customWidth: 1920,
  customHeight: 1080,
  framing: "fit",
  trimStart: 0,
  trimEnd: null,
  rotate: 0,
  keepAudio: true,
  speed: 1,
  volume: 100,
  quality: 23,
  format: "mp4",
  brightness: 0,
  contrast: 1,
  saturation: 1,
  stabilization: false,
  denoise: false,
  soundOnCompletion: false,
  sharpness: 0,
  normalizeAudio: false,
  textOverlays: [],
  chromaKeyEnabled: false,
  chromaKeyColor: "#00FF00",
  chromaKeySimilarity: 0.3,
  chromaKeyBlend: 0.1,
  version: RECIPE_VERSION,
};
