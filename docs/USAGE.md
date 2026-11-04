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
  settings removes them. See [PROJECTS.md](PROJECTS.md).

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
