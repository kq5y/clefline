import { isBlackKey, midiToPitchName, PIANO_MAX_MIDI, PIANO_MIN_MIDI } from "../lib/musicxml";
import { playMidiOnce } from "../lib/audio/pianoEngine";
import type { Hand } from "../lib/musicxml";

type PianoKeyboardProps = {
  activeNotes: Array<{ midi: number; hand: Hand }>;
  showNoteNames: boolean;
};

const KEYS = Array.from({ length: PIANO_MAX_MIDI - PIANO_MIN_MIDI + 1 }, (_, index) => {
  const midi = PIANO_MIN_MIDI + index;

  return {
    midi,
    name: midiToPitchName(midi),
    black: isBlackKey(midi),
  };
});

const WHITE_KEYS = KEYS.filter((key) => !key.black);

function whiteIndexFor(midi: number): number {
  return WHITE_KEYS.findIndex((key) => key.midi === midi);
}

function blackLeftPercent(midi: number): number {
  const previousWhiteIndex = WHITE_KEYS.findLast((key) => key.midi < midi);
  const whiteIndex = previousWhiteIndex ? whiteIndexFor(previousWhiteIndex.midi) : 0;

  return ((whiteIndex + 0.72) / WHITE_KEYS.length) * 100;
}

function activeClass(hand: Hand | undefined, black: boolean): string {
  const base = black ? "black-key" : "white-key";
  if (hand === "right") {
    return `${base} active-right`;
  }
  if (hand === "left") {
    return `${base} active-left`;
  }
  if (hand === "unknown") {
    return `${base} active-unknown`;
  }

  return base;
}

export function PianoKeyboard({ activeNotes, showNoteNames }: PianoKeyboardProps) {
  const active = new Map(activeNotes.map((note) => [note.midi, note.hand]));
  const playKey = (midi: number) => {
    void playMidiOnce(midi, 0.78);
  };

  return (
    <div className="piano-keyboard">
      <div className="white-keys">
        {WHITE_KEYS.map((key) => (
          <button
            aria-label={key.name}
            className={activeClass(active.get(key.midi), false)}
            key={key.midi}
            onPointerDown={() => playKey(key.midi)}
            data-midi={key.midi}
            type="button"
          >
            {showNoteNames && key.name.startsWith("C") ? <span>{key.name}</span> : null}
          </button>
        ))}
      </div>
      <div className="black-keys">
        {KEYS.filter((key) => key.black).map((key) => (
          <button
            aria-label={key.name}
            className={activeClass(active.get(key.midi), true)}
            key={key.midi}
            onPointerDown={() => playKey(key.midi)}
            style={{ left: `${blackLeftPercent(key.midi)}%` }}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
