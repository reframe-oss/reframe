# Export profiles

A profile is a named, reusable **output shape**: size, framing, container format and quality. Applying one changes how the video is encoded, and nothing about what is in it.

## Data model

```ts
interface ProfileSettings {
  preset: string;          // a PRESETS id, or "custom"
  customWidth: number;     // used when preset === "custom"; 16–7680
  customHeight: number;    // used when preset === "custom"; 16–7680
  framing: "fit" | "fill"; // letterbox or crop to the output shape
  format: "mp4" | "webm" | "mkv" | "gif";
  quality: number;         // CRF 18–30 (not used for GIF)
}

interface ExportProfile {
  id: string;              // "builtin:<slug>" or "user:<random>"
  name: string;            // 1–60 characters, unique (case-insensitive)
  builtIn: boolean;
  settings: ProfileSettings;
}
```

**What a profile never contains.**
- Trim points, rotation, speed, audio settings, colour adjustments, text or image overlays.
- The source video, or anything about it.

Applying a profile therefore can't change any of those. The one exception is the existing editor rule that GIF has no audio, which turns `keepAudio` off when `format` becomes `gif`, exactly as choosing GIF by hand does. Undo restores it.

**Output size.** The encoded size comes from `resolveOutputSize` in `src/lib/ffmpegArgs.ts`, the function the FFmpeg worker uses. It takes the preset's size or the custom size, rounded to even numbers. The UI, the tests and the export all read that function.

### Built-in profiles

Named by shape and size, not by platform, so Reframe doesn't imply endorsement. Each maps to an existing preset, so the size and framing controls show the matching preset as selected.

| Profile | Preset | Output | Aspect | Format | Quality (CRF) | Framing |
|---|---|---|---|---|---|---|
| Landscape 1080p | `landscape-16-9` | 1920 × 1080 | 16 : 9 | MP4 | 23 | Fit |
| Landscape 720p | `twitter-hd` | 1280 × 720 | 16 : 9 | MP4 | 23 | Fit |
| Square 1080 | `square-1-1` | 1080 × 1080 | 1 : 1 | MP4 | 23 | Fit |
| Portrait 4 : 5 | `instagram-4-5` | 1080 × 1350 | 4 : 5 | MP4 | 23 | Fit |
| Portrait 9 : 16 | `vertical-9-16` | 1080 × 1920 | 9 : 16 | MP4 | 23 | Fit |

Built-ins use **Fit**, so applying one never crops the picture without the user choosing to. Switching to Fill shows the crop in the preview before export.

### Storage

- **Where.** User profiles live in `localStorage` under `reframe:export-profiles`, as `{ schemaVersion: 1, profiles: ExportProfile[] }`. Built-ins are code, not stored.
- **Limits.** At most 30 user profiles.
- **Validation.** Every read goes through a strict parser, like project files: unknown keys are dropped, a wrong type or out-of-range value rejects the profile, and an unknown preset id or format rejects it too.
- **Upgrading and failures.**
  - A newer `schemaVersion` is never overwritten.
  - Older versions go through a `MIGRATIONS` table.
  - If storage is unavailable or full, profiles still work for the session and the UI says they couldn't be saved.

### Format rules (validated, shown in the UI)

| Combination | Handling |
|---|---|
| GIF + audio | Audio is dropped (existing rule); the profile notes "GIF has no audio" |
| GIF + quality | CRF is ignored by the GIF encoder; the profile notes "Quality isn't used for GIF" |
| GIF wider or taller than 1080 px | Allowed, with a warning: a 6-second 1080p GIF is about 130 MB |
| Custom size | 16–7680 px per side; odd values are rounded to even at export, and the UI shows the rounded size |

## State transitions

```
             apply(profile)                    undo
 EditState ─────────────────▶ EditState' ─────────────▶ EditState
   (recipe)   one history       recipe with only            (exact previous
              entry             preset/custom size/          snapshot)
                                framing/format/quality
                                replaced (+ GIF audio rule)

 profiles ── save(name) ──▶ profiles + {user profile from current output settings}
 profiles ── rename(id) ──▶ profiles with that profile's name changed
 profiles ── delete(id) ──▶ profiles without it   (built-ins can't be renamed or deleted)
```

- **Applying is an edit.** It is recorded in the edit history as one step, never coalesced, because profiles are discrete choices. Applying a profile that matches the current settings records nothing.
- **Managing profiles is not an edit.** Saving, renaming and deleting don't touch the video's settings or the undo history.
- **The "current profile" is derived, not stored.** A profile shows as active when the current output settings equal its settings. After a manual change, none shows as active.

## Preview-only aids

- **Framing.** The existing framing overlay shows letterbox bars (Fit) or the crop (Fill) for the current output shape.
- **Safe-area guides.** A toggle draws 90% and 80% inset rectangles inside the output frame. They are local UI state in `VideoPreview`, not part of `EditState`, so they can't reach the export.

## Fixed alongside: the Fill preview showed the wrong crop

The old preview overlay assumed a 16:9 source and dimmed the top and bottom when a taller output was set to Fill. FFmpeg actually crops the left and right in that case: from a 16:9 clip, a 9:16 output keeps a vertical strip about 32% of the source's width.

`src/lib/framing.ts` now computes the frame from the real source aspect ratio, with the same scale-to-cover-and-crop rule as `ffmpegArgs.ts`, and `exportProfiles.test.ts` pins the values.

## Tests

- **Unit** (`src/lib/tests/exportProfiles.test.ts`):
  - built-in sizes;
  - every built-in profile × MP4/WebM/MKV/GIF through the real `buildArguments` / `buildGifArguments`, checking scale, pad or crop, CRF, and no audio or CRF for GIF;
  - applying a profile changes only the output fields;
  - validation, storage parsing, migration, limits, names and format notes;
  - output-frame geometry.
- **Hook and UI** (`src/hooks/tests/exportProfiles.test.tsx`):
  - one undo step that keeps trims and overlays;
  - export arguments after applying a profile;
  - no-op re-apply;
  - the GIF audio rule with undo;
  - persistence, a newer schema left untouched, and storage-full fallback;
  - apply, save, rename and delete in the component.
- **Browser** (`test/e2e/profiles.spec.ts`, Playwright, both engines), using the real UI on a production build:

  | Profile | Framing | Format | Result |
  |---|---|---|---|
  | Square 1080 | Fill | MP4 | 1080 × 1080 |
  | Portrait 9 : 16 | Fit | WebM | 1080 × 1920 |
  | Landscape 720p | Fill | MKV | 1280 × 720 |
  | Landscape 720p | Fit | GIF | 1280 × 720, 58.6 MB |

  Each run also checks that the active profile is marked and that the safe-area guides can be shown.

## Out of scope for this change

- Batch export to several profiles.
- Before/after preview (`ComparisonPreview` already exists).
- Syncing or sharing profiles.
- GIF frame rate and size controls (the next candidate).
