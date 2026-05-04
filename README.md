# Clefline

Clefline is a fullscreen browser app for beginner piano practice. It loads
MusicXML, shows a falling-note piano roll, highlights an 88-key keyboard, and can
switch to a notation view rendered by OpenSheetMusicDisplay.

![Clefline note roll view showing the Bach Minuet sample](docs/screenshot.png)

## Commands

```sh
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm test:e2e
```

`pnpm check` runs type checking, oxlint, and unit tests.

## Samples

The sample scores in `public/samples/` are from the
[MuseTrainer public domain MusicXML library](https://github.com/musetrainer/library):

| File | Title | Composer |
|------|-------|----------|
| `bach-minuet.mxl` | Minuet in G Major BWV Anh. 114 | J.S. Bach |
| `fur-elise-easy.mxl` | Für Elise (Easy) | Beethoven |
| `flight-of-the-bumblebee.mxl` | Flight of the Bumblebee | Rimsky-Korsakov |
| `la-campanella.mxl` | La Campanella (Grandes Études de Paganini No. 3) | Franz Liszt |
| `moonlight-sonata-3rd.mxl` | Piano Sonata No. 14 "Moonlight" 3rd Movement | Beethoven |

All samples are public domain.

## License

Code is available under the MIT License.

Sample scores are public domain from the MuseTrainer library.

Sheet music rendering is powered by [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay),
licensed under the BSD 3-Clause License.
