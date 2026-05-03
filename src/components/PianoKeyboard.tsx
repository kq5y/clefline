import { isBlackKey, midiToPitchName, PIANO_MAX_MIDI, PIANO_MIN_MIDI } from "../lib/musicxml";

type PianoKeyboardProps = {
  activeMidi: number[];
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

export function PianoKeyboard({ activeMidi, showNoteNames }: PianoKeyboardProps) {
  const active = new Set(activeMidi);

  return (
    <div className="piano-keyboard">
      <div className="white-keys">
        {WHITE_KEYS.map((key) => (
          <div
            className={active.has(key.midi) ? "white-key active" : "white-key"}
            key={key.midi}
            data-midi={key.midi}
          >
            {showNoteNames && key.name.startsWith("C") ? <span>{key.name}</span> : null}
          </div>
        ))}
      </div>
      <div className="black-keys" aria-hidden="true">
        {KEYS.filter((key) => key.black).map((key) => (
          <div
            className={active.has(key.midi) ? "black-key active" : "black-key"}
            key={key.midi}
            style={{ left: `${blackLeftPercent(key.midi)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
