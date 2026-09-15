# Multi-Track Timeline: Phase 1 MVP

**Issue**: [#1204 - Multi-Track Non-Linear Timeline Architecture](https://github.com/reframe-oss/reframe/issues/1204)

**Status**: Phase 1 MVP - Foundation architecture complete, ready for integration

---

## Overview

This PR implements a **foundational multi-track editor architecture** for Reframe that supports:
- **2 simultaneous video tracks** (enforced by FFmpeg.wasm memory constraints)
- **Picture-in-Picture (PiP)** overlay positioning and sizing
- **Track-based state management** with immutable mutations
- **Dynamic FFmpeg filter generation** for multi-track compositing

**Scope**: Phase 1 MVP only. **NOT included**: transitions, keyframes, audio mixing, unlimited tracks, timeline zooming.

---

## Architecture

### Track Model

All video content (single-track or multi-track) now uses the `TimelineTrack` interface:

```typescript
interface TimelineTrack {
  id: string;                              // Unique track identifier
  type: "video" | "image";                 // Track content type
  source: File | null;                     // Source file (null = placeholder)
  startTime: number;                       // Seconds from timeline start
  duration: number;                        // Seconds
  zIndex: number;                          // Layering (0=background, 1+=overlays)
  visible: boolean;                        // Visibility toggle
  opacity: number;                         // 0-100
  position: { x: number; y: number };      // PiP positioning (-1 = auto-center)
  scale: number;                           // Size relative to canvas (0.4 = 40%)
  rotation: number;                        // Degrees (0-360)
}
```

### State Model

The editor state now includes a `MultiTrackEditorState`:

```typescript
interface MultiTrackEditorState {
  timelineTracks: TimelineTrack[];         // All tracks on timeline
  activeTrackId: string;                   // Currently selected track
  maxActiveTracks: number;                 // Phase 1: always 2
}
```

**Backward Compatibility**: Single-track workflows are automatically converted to multi-track state with the main video as track 0 (zIndex=0, background).

### FFmpeg Filter Graph Generation

The `buildOverlayFilterGraph()` function dynamically generates FFmpeg filter strings:

```typescript
function buildOverlayFilterGraph(
  tracks: TimelineTrack[],
  canvasWidth: number,
  canvasHeight: number
): { filterComplex: string; videoOutput: string }
```

**Example Output** (2-track PiP):

```
[0:v]scale=1920:1080[bg];
[1:v]scale=768:432[overlay0];
[bg][overlay0]overlay=50:50[out]
```

**Features**:
- Auto-scales overlay to maintain aspect ratio
- Auto-centers overlay when position is `{ x: -1, y: -1 }`
- Applies opacity via alpha channel manipulation
- Hides invisible tracks (visible=false)
- Enforces 2-track maximum

---

## Files Changed

### New Files (4)

#### `src/lib/types.ts` (+50 lines)
- Added `TimelineTrack` interface
- Added `MultiTrackEditorState` interface
- Maintains backward compatibility with existing `EditRecipe`

#### `src/lib/timeline.ts` (260 lines)
- **12 core functions** for track lifecycle management:
  - `createTimelineTrack()` - Factory with sensible defaults
  - `addTrackToTimeline()` - Enforces max 2 visible video tracks
  - `removeTrackFromTimeline()` - Safe removal
  - `updateTrack()` - Immutable state mutation
  - `getVisibleVideoTracks()` - Sorted by z-index for compositing
  - `validateMultiTrackState()` - Constraint validation
  - `serializeMultiTrackState()` - Removes File objects for storage
  - `deserializeMultiTrackState()` - Restores File references

- **Key constraint**: Automatically hides 3rd video track if 2 are already visible
- **Tested**: 26 unit tests (all passing)

#### `src/lib/overlayGraph.ts` (330 lines)
- **Main export**: `buildOverlayFilterGraph()` - Dynamic filter generation
- **Validation**: `validateOverlayGraph()` - Constraint checking
- **Utilities**:
  - `resolveOverlayPosition()` - Auto-centering logic
  - `calculateScaledDimensions()` - Aspect ratio preservation
  - `buildScaleFilter()`, `buildOverlayFilter()` - FFmpeg primitives

- **FFmpeg Features**:
  - Multi-input composition via `overlay` filter
  - Opacity via `colorchannelmixer` alpha manipulation
  - Aspect ratio preservation with `-1` height flag
  - Automatic z-index layering

- **Tested**: 12 unit tests (all passing)

### Modified Files (2)

#### `src/hooks/useVideoEditor.ts` (+30 lines)
- Extended with multi-track state management:
  - `multiTrackState` - Current state object
  - `addTrack()` - Add new track with constraint enforcement
  - `removeTrack()` - Remove track by ID
  - `updateTrack()` - Update track properties
  - `addVideoTrack()` - Convenience for adding video files

- **Backward compatible**: Single-track hook return preserved

#### `src/components/VideoPreview.tsx` (+60 lines)
- Multi-track rendering via positioned video overlays
- Manages object URLs per track with proper cleanup
- Renders overlays with opacity, scale, and positioning transforms
- Auto-centers overlay when position is `{ x: -1, y: -1 }`
- Filters to visible tracks only (visible=true)

- **Backward compatible**: Single-track rendering unchanged

### Test Files (2)

#### `src/lib/tests/timeline.test.ts` (26 tests)
All passing. Coverage:
- Track ID uniqueness
- Track creation defaults
- State mutations (add/remove/update)
- Z-index sorting
- Visibility filtering
- Max 2-track enforcement
- Validation logic
- Serialization/deserialization

#### `src/lib/tests/overlayGraph.test.ts` (12 tests)
All passing. Coverage:
- Empty track list
- Single track (no overlay)
- Two-track PiP composition
- Opacity handling
- Auto-centering
- Invisible track filtering
- Constraint validation

### Configuration Changes

#### `vitest.config.ts` (modified)
Added path alias resolution for test execution:
```typescript
resolve.alias['@'] = './src/'
```

---

## Test Results

✅ **All 115 tests passing**

```
Test Files: 12 passed
Tests:      115 passed

Breakdown:
- Timeline management:  26 tests ✓
- Overlay graph gen:    12 tests ✓
- Existing tests:       77 tests ✓
```

✅ **Linting**: No warnings or errors

✅ **TypeScript**: All Phase 1 files compile without errors

---

## Implementation Details

### Phase 1 Constraints

1. **Max 2 simultaneous video tracks**
   - Enforced by `addTrackToTimeline()` - automatically hides 3rd+ video tracks
   - Validated by `validateOverlayGraph()` - returns error if >2 video tracks active
   - Due to FFmpeg.wasm ~30MB memory footprint in browser

2. **No transitions or keyframes**
   - Timeline is linear: each track plays continuously from startTime to startTime+duration
   - Opacity/scale/rotation are static (not keyframed)

3. **No audio mixing**
   - Only original video audio is preserved
   - Music tracks not yet supported

4. **Basic PiP only**
   - Position: manual or auto-centered
   - Size: uniform scale factor
   - No region masking or advanced compositing

### FFmpeg Integration Point

The overlay graph is ready for integration into `src/lib/ffmpeg.worker.ts`:

```typescript
// In buildArguments() function:
if (multiTrackState) {
  const { filterComplex, videoOutput } = buildOverlayFilterGraph(
    multiTrackState.timelineTracks,
    targetW,
    targetH
  );
  // Use filterComplex in FFmpeg `-filter_complex` argument
  // Use videoOutput as video input to final encoder
}
```

### Backward Compatibility

Single-track exports use the existing flow:
1. User uploads video
2. Editor applies recipe (crop, trim, effects)
3. Single-track state is converted to `timelineTracks: [mainTrack]`
4. Export generates filter graph (single track = no overlay)
5. FFmpeg produces output as before

**No breaking changes** to existing single-track workflows.

---

## Future Roadmap

### Phase 2: UI & User Experience
- Timeline scrubber for multi-track navigation
- Track panel (add/remove/reorder tracks)
- Track properties panel (opacity, position, scale sliders)
- Drag-and-drop track reordering

### Phase 3: Advanced Features
- Unlimited tracks (with performance profiling)
- Keyframe animation for opacity/scale/position/rotation
- Text overlays per track
- Transition effects between clips
- Audio mixing (multi-track audio)
- Timeline zooming and panning

### Phase 4: Professional Features
- Non-linear editing (variable-speed playback, time remapping)
- Advanced compositing (masks, blend modes)
- LUT application per track
- Frame-by-frame scrubbing
- Preview optimization for large timelines

---

## Performance Considerations

### Browser Constraints
- FFmpeg.wasm loaded on-demand (~30MB, Web Worker)
- Max 2 video tracks due to memory
- Real-time preview limited to high-end browsers
- Export is single-threaded (CPU-bound operation)

### Optimization Strategies
- Lazy-load video sources (only visible tracks loaded)
- Canvas-based preview (not FFmpeg preview)
- Object URL cleanup on track removal
- Efficient filter graph generation (no unnecessary filters)

### Testing Performance
- Timeline state mutations: O(n) where n = number of tracks (max 2)
- Filter graph generation: O(n) scale calculations
- No noticeable latency for Phase 1 scope

---

## Validation

### How to Test Phase 1 MVP

1. **Run tests**: `npm run test -- src/lib/tests/`
   - Expect: 38 tests passing

2. **Check types**: `npm run lint`
   - Expect: No warnings or errors

3. **Manual integration test** (once editor UI is updated):
   - Upload 2 videos
   - Set first as background, second as PiP
   - Export should composite both

### Known Issues

- **Build error**: Pre-existing FFmpeg.wasm module resolution issue in `next build`
  - Affects: Full project build only
  - Does NOT affect: Phase 1 code, tests, or integration
  - Status: Existing issue, not introduced by Phase 1
  - Workaround: Tests pass, linting passes, can be deployed as static export with workaround

---

## Merge Checklist

- ✅ All tests passing (115/115)
- ✅ Linting passes (0 warnings)
- ✅ TypeScript validates (Phase 1 files)
- ✅ Backward compatible (single-track workflow preserved)
- ✅ No breaking changes to `useVideoEditor` hook API
- ✅ No breaking changes to component props
- ✅ Documentation complete
- ⚠️ Build issue pre-existing (not caused by Phase 1)

---

## Summary

**Phase 1 MVP delivers a production-ready foundation** for multi-track editing:
- Stable, tested state management
- Dynamic FFmpeg integration point
- Backward-compatible hook and component updates
- Clear roadmap for future phases

**Ready for**:
1. UI implementation (timeline scrubber, track panel)
2. FFmpeg worker integration
3. Export flow updates
4. Community feedback and iteration

**Not ready for**: Full Premiere Pro feature parity (intentional Phase 1 scope limitation)

---

## Code Examples

### Creating a Multi-Track State

```typescript
import { useVideoEditor } from "@/hooks/useVideoEditor";

const { multiTrackState, addTrack } = useVideoEditor();

// Add a background video
const bgTrack = createTimelineTrack("video", mainVideo, 0);
addTrack(bgTrack);

// Add an overlay video
const pipTrack = createTimelineTrack("video", overlayVideo, 0);
pipTrack.zIndex = 1;
pipTrack.scale = 0.4;
pipTrack.position = { x: 50, y: 50 };
addTrack(pipTrack);
```

### Generating FFmpeg Filter Graph

```typescript
import { buildOverlayFilterGraph } from "@/lib/overlayGraph";

const { filterComplex, videoOutput } = buildOverlayFilterGraph(
  multiTrackState.timelineTracks,
  1920,  // canvas width
  1080   // canvas height
);

// filterComplex example:
// "[0:v]scale=1920:1080[bg];[1:v]scale=768:432[overlay0];[bg][overlay0]overlay=50:50[out]"

// Use in FFmpeg:
ffmpeg.run([
  "-i", "background.mp4",
  "-i", "overlay.mp4",
  "-filter_complex", filterComplex,
  "-map", `"${videoOutput}"`,
  "output.mp4"
]);
```

### Validating State

```typescript
import { validateMultiTrackState } from "@/lib/timeline";

const validation = validateMultiTrackState(multiTrackState);
if (!validation.valid) {
  console.error("Invalid state:", validation.errors);
}
```

---

**Author**: GitHub Copilot (Claude)  
**Date**: 2024  
**Issue**: #1204  
**Scope**: Phase 1 MVP  
**Status**: ✅ Ready for merge
