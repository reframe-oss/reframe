# Using Reframe

Reframe edits a video in your browser. Your video is never uploaded: it is
processed on your device by FFmpeg running as WebAssembly.

## Basic flow

1. Open https://reframe-os.netlify.app and drop a video on the page, or click
   to choose one. MP4, MOV, WebM, MKV and most other formats work.
2. Pick an output size. There are presets for Reels/TikTok/Shorts (9:16),
   Instagram (4:5), square, YouTube (16:9) and more, or set custom dimensions.
   Choose **Fit** to letterbox or **Fill** to crop to the new shape.
3. Edit: trim the start and end, rotate, change the speed, mute or adjust the
   audio, add text or an image overlay, and tune brightness, contrast,
   saturation and sharpness.
4. Choose a format (MP4, WebM, MKV or GIF) and quality, then **Export**.
5. When it finishes, **Download** the file.

The first export downloads the video engine (about 30 MB), so it takes longer.
Later exports reuse it.

## Trim timeline

Once a video is open, the trim timeline fills with frames from the video,
so you can see where to cut. They're made by the video engine in the
background (the first time, that includes downloading it) and kept in this
browser, so the same video shows them at once next time. The parts outside
the trim are dimmed. Click the strip to move the preview there, and drag the
handles (or use the arrow keys on them) to set the start and end. While an
export runs, making frames pauses and carries on afterwards.

## Text and captions

**Add Text** in the Text section puts a line of text on the video. Drag it
in the preview to place it; the preview shows it where, and at the size,
the export will draw it. By default text stays on for the whole video. To
show it for part of it, set **From** and **Until** in seconds of the video,
or play to a moment and press **Start at playhead** or **End at playhead**.
**Whole video** clears the times. Times follow the source video, so they
stay right when you trim or change the speed, and text outside the trim is
left out. **Dark box behind the text** gives it a caption-style background.

**Import captions** reads an `.srt` or `.vtt` subtitle file and adds each
cue as a timed caption near the bottom of the frame, sized for the output.
An edit holds up to 500 text items; a longer file adds its first 500 cues.
**Remove all** clears them. Exported text uses the bundled Geist font
whatever font the preview shows.

## Batch export

**Batch export** in the Edit panel applies this edit to other videos. Add
them with **Add videos** or drop them on the panel (up to 50), then press
**Export N videos**. They export one at a time, each with its own progress,
and use everything you've set except the trim, which belongs to the video it
was set on: each video in the batch keeps its full length. Output files are
named after their source (`clip.mov` becomes `clip-reframe.mp4`).

Download each video from its row, or, in Chrome and Edge, **Save all to a
folder** writes them into a folder you pick. **Cancel batch** stops the
current export and keeps the finished ones; pressing Export again carries on
with the rest and retries any that failed. The editor's own Export waits
while a batch runs, since they share the video engine.

## Export profiles

The **Profile** section at the top of the output panel applies a whole set of
output settings at once: size, framing, format and quality. There are
built-in profiles (Landscape 1080p and 720p, Square 1080, Portrait 4 : 5 and
9 : 16), and **Save profile** stores your own in this browser, where
you can rename or delete them. Applying a profile is one undo step and keeps
your trims and overlays. **Safe area** in the preview toolbar shows the 90%
and 80% safe zones; it's preview-only and never exported. More in
[EXPORT_PROFILES.md](EXPORT_PROFILES.md).

## Undo and recovery

- Every edit can be undone and redone. A slider drag counts as one step.
- Your edits and a copy of the open video are kept in this browser, so a
  refresh doesn't lose work. Clearing this site's data in your browser
  settings removes them, along with the cached timeline frames. See [PROJECTS.md](PROJECTS.md).

## Keyboard shortcuts

On macOS use **Cmd** where this says Ctrl.

| Shortcut | Action |
|---|---|
| Ctrl+Enter | Export the video |
| Ctrl+Shift+E | Export the video (when no export is running) |
| Escape | Cancel the export in progress |
| Ctrl+Z | Undo the last edit |
| Ctrl+Y, or Ctrl+Shift+Z | Redo |
| Space | Play or pause the preview |
| I | Set the trim start to the current position |
| O | Set the trim end to the current position |
| M | Mute or unmute the video's audio |
| R | Reset all settings |
| 1 – 9 | Choose one of the first nine output presets |
| ? | Show the shortcut list |

Shortcuts other than undo and redo are ignored while you're typing in a text
field.

## Exports that are slow or fail

- **Multi-threaded and single-threaded engines.** On a site served with
  cross-origin isolation (as the live site is), Reframe uses the faster
  multi-threaded engine. If an export stops making progress, Reframe restarts
  it once on the single-threaded engine automatically; if that also stalls,
  you'll see a message with a **Retry** button.
- **Large files** need a lot of memory. Close other tabs, or trim the clip or
  lower the output resolution first.
- **Screen recordings** made in a browser often have no length in the file.
  Reframe works it out when the file loads; this can take a moment for long
  recordings.

## Privacy

Your videos never leave your device. Reframe collects anonymous performance
and error data (no file names, captions or video content) to improve export
reliability, and you can turn it off under **Settings** in the page footer.
See the [privacy page](https://reframe-os.netlify.app/privacy) and
[DATADOG.md](DATADOG.md) for exactly what is sent.
