# Piano River

Piano River is a fullscreen browser app for beginner piano practice. It loads
MusicXML, shows a falling-note piano roll, highlights an 88-key keyboard, and can
switch to a notation view rendered by OpenSheetMusicDisplay.

## Stack

- React 19, Vite 8, TypeScript 6
- `pnpm` only for package management
- `oxlint` for linting and `oxfmt` for formatting
- OpenSheetMusicDisplay for notation rendering
- Tone.js for browser audio playback. Piano playback uses Salamander Grand Piano sample URLs at
  runtime, with no bundled audio files.
- Vitest and Playwright for automated checks

## Commands

```sh
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm test:e2e
```

`pnpm check` runs type checking, oxlint, and unit tests. The app is a static SPA,
so Cloudflare Pages and Vercel can deploy it from `pnpm build` with `dist/` as
the output directory.

## Samples

Only `public/samples/sample_science.musicxml` is public and committed. Other
local samples such as `sample_ray.musicxml` and `sample_spica.musicxml` are for
private validation only and must not be committed or published. `.gitignore`
contains explicit guards for those files and `private-samples/`.

## Current Scope

The v1 parser targets MuseScore-style single Piano part MusicXML with two staves.
Staff 1 is treated as right hand and staff 2 as left hand. The parser detects
ties, chords, grace notes, arpeggios, dynamics, wedges, articulations,
glissando, octave shifts, and repeat-navigation markers. Repeat paths that
cannot be expanded deterministically are surfaced as score warnings.
