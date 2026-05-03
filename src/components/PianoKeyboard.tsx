import { memo, useCallback, useMemo } from "react";
import { playMidiOnce } from "../lib/audio/pianoEngine";
import { BLACK_KEY_LAYOUTS, WHITE_KEY_LAYOUTS } from "../lib/pianoLayout";
import type { Hand } from "../lib/musicxml";

type PianoKeyboardProps = {
  activeNotes: Array<{ midi: number; hand: Hand }>;
  showNoteNames: boolean;
  volume: number;
};

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

function sameActiveNotes(
  previous: PianoKeyboardProps["activeNotes"],
  next: PianoKeyboardProps["activeNotes"],
): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index].midi !== next[index].midi || previous[index].hand !== next[index].hand) {
      return false;
    }
  }

  return true;
}

export const PianoKeyboard = memo(
  function PianoKeyboard({ activeNotes, showNoteNames, volume }: PianoKeyboardProps) {
    const active = useMemo(
      () => new Map(activeNotes.map((note) => [note.midi, note.hand])),
      [activeNotes],
    );
    const playKey = useCallback(
      (midi: number) => {
        void playMidiOnce(midi, volume);
      },
      [volume],
    );

    return (
      <div className="piano-keyboard">
        <div className="white-keys">
          {WHITE_KEY_LAYOUTS.map((key) => (
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
          {BLACK_KEY_LAYOUTS.map((key) => (
            <button
              aria-label={key.name}
              className={activeClass(active.get(key.midi), true)}
              key={key.midi}
              onPointerDown={() => playKey(key.midi)}
              style={{
                left: `${key.centerPercent}%`,
                width: `${key.keyWidthPercent}%`,
              }}
              type="button"
            />
          ))}
        </div>
      </div>
    );
  },
  (previous, next) =>
    previous.showNoteNames === next.showNoteNames &&
    previous.volume === next.volume &&
    sameActiveNotes(previous.activeNotes, next.activeNotes),
);
