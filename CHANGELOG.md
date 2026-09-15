# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial placeholder for upcoming feature and bug-fix notes.

### Changed
- Refined documentation and release tracking structure.

### Fixed
- No changes released yet for this version.

### Removed
- No removals recorded yet for this version.

## [0.3.0] - 2026-05-01

### Added
- Export progress overlay with live status updates during browser-based FFmpeg.wasm rendering.
- CRF quality slider for fine-grained control over output video quality and bitrate.
- Cross-origin isolation headers documented for multi-threading support in modern browsers.

### Changed
- Updated preset selector UI with eleven supported format presets plus a custom configuration option.
- Improved export workflow to reduce UI blocking while FFmpeg.wasm processes video.

### Fixed
- Resolved export failure when using custom preset values in certain browser environments.
- Fixed progress overlay timeout handling for long-running exports.

### Removed
- Removed legacy upload notification banner from the export flow.

## [0.2.0] - 2026-04-10

### Added
- Audio speed control for adjusting playback rate and exported audio pitch.
- Rotate control for portrait and landscape fixes during video editing.
- Drag-and-drop file upload support for faster file selection.

### Changed
- Improved trim controls with explicit start/end time fields and keyboard accessibility.
- Refined preset label names for clarity across Vercel and Netlify deployments.

### Fixed
- Fixed trim start/end snapping issues when importing high-frame-rate videos.
- Addressed audio sync drift after speed changes in preview mode.

### Removed
- Removed duplicate progress spinner from the file upload experience.

## [0.1.0] - 2026-03-20

### Added
- Initial client-side video editor built with Next.js static export and TypeScript.
- FFmpeg.wasm integration for in-browser export and format conversion.
- Preset format selector with support for common video targets and custom output.
- Trim controls for setting video start and end points.
- Export workflow targeting static deployment on Vercel and Netlify.

### Changed
- Laid groundwork for browser-based video processing and component-driven editor UI.

### Fixed
- Fixed initial file validation issues for unsupported video MIME types.
- Addressed responsive layout bugs in the editor preview panel.

### Removed
- Removed placeholder demo assets from the production export path.

---

### Notes
- Date format used in this changelog is `YYYY-MM-DD`.
