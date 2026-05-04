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
