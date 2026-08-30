# OSMD Fork Modifications

This is a fork of [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) v1.9.7 with custom modifications for Clefline.

## Changes from upstream

### Async Rendering Support
- **File**: `src/OpenSheetMusicDisplay/OpenSheetMusicDisplay.ts`
- Added `renderAsync()` method for non-blocking rendering with progress callback
- Prevents UI freeze during large score loading

- **File**: `src/MusicalScore/Graphical/MusicSheetCalculator.ts`
- Added `calculateMusicSystemsAsync()` for async layout calculation

- **File**: `src/MusicalScore/Graphical/VexFlow/VexFlowMusicSheetDrawer.ts`
- Added `drawSheetAsync()` for async drawing with progress reporting

### Yielding Strategy
- **File**: `src/Util/AsyncUtil.ts`
- `yieldToMain()` falls back to `setTimeout` when the tab is hidden, where
  `requestAnimationFrame` never fires and rendering would stall indefinitely
- Added `YieldGuard`, which yields on a time budget instead of an item count

- **Files**: `src/MusicalScore/Graphical/GraphicalMusicSheet.ts`,
  `src/MusicalScore/Graphical/MusicSystemBuilder.ts`
- Every yield costs a full frame, so yielding every N items dominated the work
  itself: `transformRelativeToAbsolutePositionAsync` spent 2.4s of a 6s render
  waiting for frames. Both now yield through `YieldGuard`

### Chunked Sky/Bottom Line Calculation
- **Files**: `src/MusicalScore/Graphical/MusicSheetCalculator.ts`,
  `src/MusicalScore/Graphical/VexFlow/VexFlowMusicSheetCalculator.ts`
- Added `calculateSkyBottomLinesAsync()`, which batches a bounded number of
  measures at a time and yields in between. Batching every measure of a long
  horizontal staffline at once froze the main thread for ~0.8s

### Minimum Measure Width
- **File**: `src/MusicalScore/Graphical/EngravingRules.ts`
- Added `MinimumMeasureWidth` property to prevent narrow measures (e.g., whole notes)

- **File**: `src/MusicalScore/Graphical/MusicSheetCalculator.ts`
- Enforce minimum measure width during layout calculation

### Wavy Glissando Rendering
- **File**: `src/MusicalScore/Graphical/EngravingRules.ts`
- Added `GlissandoWaveAmplitude` and `GlissandoWaveLength` properties

- **File**: `src/MusicalScore/Graphical/VexFlow/VexFlowBackend.ts`
- Added abstract `renderWavyLine()` method

- **File**: `src/MusicalScore/Graphical/VexFlow/SvgVexFlowBackend.ts`
- Implemented `renderWavyLine()` using SVG path

- **File**: `src/MusicalScore/Graphical/VexFlow/CanvasVexFlowBackend.ts`
- Implemented `renderWavyLine()` using Canvas API

- **File**: `src/MusicalScore/Graphical/VexFlow/VexFlowMusicSheetDrawer.ts`
- Modified `drawGlissando()` to use VexFlow's arpeggio glyph (va3) for consistent wavy line styling

## Build

```bash
pnpm install
pnpm run build
```

## License

Original OSMD is licensed under BSD 3-Clause License. See [LICENSE](./LICENSE).
