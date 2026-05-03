import { isBlackKey, midiToPitchName, PIANO_MAX_MIDI, PIANO_MIN_MIDI } from "./musicxml/pitch";

export type PianoKeyLayout = {
  midi: number;
  name: string;
  black: boolean;
  centerPercent: number;
  keyWidthPercent: number;
  noteWidthPercent: number;
};

const WHITE_KEY_COUNT = 52;
const WHITE_KEY_WIDTH = 100 / WHITE_KEY_COUNT;
const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.62;
const WHITE_NOTE_WIDTH = WHITE_KEY_WIDTH * 0.88;
const BLACK_NOTE_WIDTH = BLACK_KEY_WIDTH * 0.86;

const layouts: PianoKeyLayout[] = [];
let lastWhiteIndex = -1;

for (let midi = PIANO_MIN_MIDI; midi <= PIANO_MAX_MIDI; midi += 1) {
  const black = isBlackKey(midi);
  if (!black) {
    lastWhiteIndex += 1;
  }

  const centerPercent = black
    ? (lastWhiteIndex + 1) * WHITE_KEY_WIDTH
    : (lastWhiteIndex + 0.5) * WHITE_KEY_WIDTH;

  layouts.push({
    midi,
    name: midiToPitchName(midi),
    black,
    centerPercent,
    keyWidthPercent: black ? BLACK_KEY_WIDTH : WHITE_KEY_WIDTH,
    noteWidthPercent: black ? BLACK_NOTE_WIDTH : WHITE_NOTE_WIDTH,
  });
}

export const PIANO_KEY_LAYOUTS = layouts;
export const WHITE_KEY_LAYOUTS = layouts.filter((key) => !key.black);
export const BLACK_KEY_LAYOUTS = layouts.filter((key) => key.black);

const layoutByMidi = new Map(layouts.map((layout) => [layout.midi, layout]));

export function pianoKeyLayoutForMidi(midi: number): PianoKeyLayout {
  const layout = layoutByMidi.get(midi);
  if (layout) {
    return layout;
  }

  return midi < PIANO_MIN_MIDI ? layouts[0] : layouts[layouts.length - 1];
}
