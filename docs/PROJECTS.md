# Undo, recovery and project files

This covers how Reframe keeps edit history, what it saves in the browser, and the `.reframe.json` project format. Nothing here sends data anywhere. Everything stays in the user's browser or in files the user saves themselves.

## Edit state

`EditState` (`src/lib/editHistory.ts`) is the single source of truth for every edit that changes the exported video:

| Included | Where it lives |
|---|---|
| Preset, custom size, framing, trim, rotation | `recipe` |
| Keep audio, normalise, volume, speed | `recipe` |
| Quality, format, brightness, contrast, saturation, sharpness, stabilisation, denoise | `recipe` |
| Text overlays (text, position, size, colour, weight, font name) | `recipe.textOverlays` |
| Image overlay position, size and opacity | `imageOverlay` |

Not included, on purpose:

- **The completion-sound preference.** It's a setting, not an edit, so undo never flips it.
- **Files** (the source video, the image overlay file, background music). They are binary assets, not edit values, so adding or removing the image file is not an undo step.
- **Transient UI state.** Hover, open panels, the selected text overlay, export progress, object URLs and worker state.
- **The multi-track timeline state.** It isn't connected to the UI or the export yet (see `PHASE_1_MVP.md`).

`useVideoEditor` exposes `recipe` derived from `EditState`. `handleExport` passes that same object, plus the image overlay settings, to `exportVideo`. So after an undo the preview and the export can't disagree.

## Undo and redo

- **Snapshots.** Each history entry is an immutable `EditState`, about 1 KB, never media. Undo and redo just move between entries.
- **Bounded.** `HISTORY_LIMIT` is 100 entries. The oldest are dropped first.
- **No duplicates.** A change that leaves the state equal to the current one is not recorded.
- **Coalescing.** Repeated changes to the same continuous control within `COALESCE_WINDOW_MS` (600 ms) merge into one step:
  - Continuous controls are sliders, trim handles, custom size, and text-overlay text, position, size and colour.
  - The window slides, so a long drag stays one step.
  - Dragging back to the starting value removes the step.
  - Discrete choices (preset, format, rotation, toggles, image overlay position) always get their own step, however fast they're clicked.
  - Adding or removing a text overlay is always its own step.
- **When history resets.** Choosing a new video, restoring a session and deleting saved data each start a fresh history.
- **During export.** Undo and redo are disabled while an export runs. The running export has already taken its settings.
- **Reset settings.** "Reset settings" and the `R` shortcut are now a single undoable step. They no longer delete saved data.

**Shortcuts.** macOS uses ⌘Z and ⇧⌘Z. Other platforms use Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z. They work while a slider, checkbox or button has focus. In text fields and `contenteditable` they are left to the browser, so they undo the typing. See `src/lib/historyShortcuts.ts`.

## What is saved in the browser

| Key | Store | Contents |
|---|---|---|
| `reframe:project` | localStorage | The current project document (below). Written 500 ms after the last edit while a video is open, and on `pagehide`. |
| `reframe-session` / `files` / `currentVideo` | IndexedDB | One copy of the open source video, overwritten when a new video is chosen. Unchanged from before. |
| `reframe:recipe`, `editorState`, `soundOnCompletion` | localStorage | Existing settings records, kept for compatibility. |

The project record is stored in localStorage rather than IndexedDB because it is only a few KB and a synchronous write can be flushed reliably when the page is hidden.

**Recovery on load**, in this order:

1. A `?settings=` share link wins.
2. Otherwise the saved project's edits are restored.
3. Otherwise the older URL and recipe records are used, as before.

Then the stored video copy is read from IndexedDB:

- **The copy is present.** The editor opens with the video and the edits.
- **The copy is missing, or IndexedDB fails.** This can happen after eviction, private mode, or a quota error when saving. A notice names the file, its size and length, and asks the user to choose it again.
  - Choosing a file with the same name and byte size resumes the project, trims included.
  - A different file keeps the other settings but resets the trim points, like any new video.
  - "Discard saved edits" forgets the project.

**Failures are reported in the "Saved on this device" panel:**

- If the video copy can't be stored, the user is told they'll need to choose the file again after a refresh.
- If the edit record can't be written, they're told to use "Save project file".

**Delete saved data** asks for confirmation. It then removes the project record, the recipe and overlay records and the stored video copy, closes the video and resets the editor. Project files the user saved are not affected.

## Project file format

"Save project file" downloads `<video name>.reframe.json`:

```json
{
  "format": "reframe-project",
  "schemaVersion": 1,
  "savedAt": "2026-10-22T12:00:00.000Z",
  "source": { "name": "clip.mp4", "size": 24000000, "type": "video/mp4",
              "lastModified": 1700000000000, "duration": 42.5, "width": 1920, "height": 1080 },
  "edit": {
    "recipe": { "preset": "square-1-1", "trimStart": 3, "trimEnd": 20, "...": "every EditRecipe field except soundOnCompletion" },
    "imageOverlay": { "position": "top-left", "size": 250, "opacity": 60 }
  }
}
```

The file never contains the video, the image overlay or any other media.

**Opening a project file:**

- **A video is open.** The edits are applied as one undoable step. Trim points that don't fit the video are dropped. If the project was made for a different file, the user is told to check the trims.
- **No video is open.** The edits are held and the user is asked to choose the project's video.

### Validation

Every document, whether imported or read back from storage, goes through `parseProject` in `src/lib/project.ts`. It rejects the whole document if anything is wrong. It never clamps values or merges them with defaults.

**Size and shape:**

- Input over 512 KB is rejected before parsing.
- The document must be a JSON object with `format: "reframe-project"` and an integer `schemaVersion`.

**Field checks:**

- Every recipe field must be present, with the same types and ranges the editor enforces.
- Presets must be known ids, and speed one of the speed steps.
- Trim end must be after trim start.
- At most 50 text overlays, each with text of at most 500 characters.
- Overlay ids must match `[A-Za-z0-9_-]{1,64}` and must be unique. Colours must be `#rrggbb`.
- Font names must match `[A-Za-z0-9 _-]{1,64}`, because they reach FFmpeg's `drawtext` filter.

**Safe construction:**

- `fontPath` is never read from a project file, because it is passed to FFmpeg as a file path. It is also never written, since a `blob:` URL is meaningless outside the tab.
- Output objects are built field by field, so unknown keys, including `__proto__`, are dropped rather than copied.

### Changing the schema

1. Bump `PROJECT_SCHEMA_VERSION`.
2. Add `MIGRATIONS[oldVersion] = (doc) => upgradedDoc`. It runs on raw JSON before validation, and migrations chain one version at a time.
3. Update the validators for the new shape and add a test that parses a document from the old version.

Documents from a newer schema than the page knows are refused with "saved by a newer version of Reframe… reload the page". A version with no migration path is refused too.

A change to `EditRecipe` fields needs a project schema bump, because the validator requires every field.

## Not done yet: export profiles

Reusable export profiles were scoped out of this change so undo/redo and recovery could land as one coherent slice. The suggested next slice:

- **Profiles.** A profile is a named subset of `EditState["recipe"]`: preset or custom size, framing, format, quality and audio options. It is stored in its own localStorage key with its own schema version, and never includes trims, overlays or media.
- **Built-in profiles.** Landscape 1920×1080, square 1080×1080 and portrait 1080×1920, plus 1080×1350. Label them by shape and size, not by platform name, to avoid implying endorsement.
- **Applying a profile.** Applying one is one undoable `updateEdit` step. Manual controls stay as they are.
- **Command-builder tests.** A test runs every profile through the worker's `buildArguments`/`buildVideoFilter` and asserts the scale and pad output matches the declared dimensions.
- **Safe-area guides.** A CSS overlay on the preview only. It is not part of `EditState`, so it can't reach the export.
- **Batch export, if added.** Encode one profile at a time through the existing worker, never concurrently, and report each output's success or failure separately.
