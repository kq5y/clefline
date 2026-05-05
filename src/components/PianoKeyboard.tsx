import { memo, useCallback, useMemo, useRef } from "react";
import { playMidiOnce } from "../lib/audio/pianoEngine";
import {
  BLACK_KEY_LAYOUTS,
  pianoKeyLayoutForMidiInRange,
  WHITE_KEY_LAYOUTS,
} from "../lib/pianoLayout";
import type { Hand } from "../lib/musicxml";
import type { RiverRange } from "../store/practiceStore";

type PianoKeyboardProps = {
  activeNotes: Array<{ midi: number; hand: Hand }>;
  riverRange: RiverRange;
  showNoteNames: boolean;
  volume: number;
};

const CLASS_CACHE: Record<string, string> = {};

function activeClass(hand: Hand | undefined, black: boolean): string {
  const key = `${hand ?? "none"}-${black}`;
  if (CLASS_CACHE[key]) return CLASS_CACHE[key];

  const base = black ? "black-key" : "white-key";
  let result: string;
  if (hand === "right") {
    result = `${base} active-right`;
  } else if (hand === "left") {
    result = `${base} active-left`;
  } else if (hand === "unknown") {
    result = `${base} active-unknown`;
  } else {
    result = base;
  }
  CLASS_CACHE[key] = result;
  return result;
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
  function PianoKeyboard({ activeNotes, riverRange, showNoteNames, volume }: PianoKeyboardProps) {
    const volumeRef = useRef(volume);
    volumeRef.current = volume;
    const active = useMemo(
      () => new Map(activeNotes.map((note) => [note.midi, note.hand])),
      [activeNotes],
    );
    const playKey = useCallback((midi: number) => {
      void playMidiOnce(midi, volumeRef.current);
    }, []);

    const whiteKeys = useMemo(
      () =>
        WHITE_KEY_LAYOUTS.filter(
          (key) => key.midi >= riverRange.minMidi && key.midi <= riverRange.maxMidi,
        ).map((key) => ({
          ...key,
          layout: pianoKeyLayoutForMidiInRange(key.midi, riverRange.minMidi, riverRange.maxMidi),
        })),
      [riverRange],
    );

    const blackKeys = useMemo(
      () =>
        BLACK_KEY_LAYOUTS.filter(
          (key) => key.midi >= riverRange.minMidi && key.midi <= riverRange.maxMidi,
        ).map((key) => ({
          ...key,
          layout: pianoKeyLayoutForMidiInRange(key.midi, riverRange.minMidi, riverRange.maxMidi),
        })),
      [riverRange],
    );

    return (
      <div className="piano-keyboard">
        <div className="white-keys">
          {whiteKeys.map((key) => (
            <button
              aria-label={key.name}
              className={activeClass(active.get(key.midi), false)}
              key={key.midi}
              onPointerDown={() => playKey(key.midi)}
              data-midi={key.midi}
              type="button"
              style={{ width: `${key.layout.keyWidthPercent}%` }}
            >
              {showNoteNames && key.name.startsWith("C") ? <span>{key.name}</span> : null}
            </button>
          ))}
        </div>
        <div className="black-keys">
          {blackKeys.map((key) => (
            <button
              aria-label={key.name}
              className={activeClass(active.get(key.midi), true)}
              key={key.midi}
              onPointerDown={() => playKey(key.midi)}
              style={{
                left: `${key.layout.centerPercent}%`,
                width: `${key.layout.keyWidthPercent}%`,
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
    previous.riverRange.minMidi === next.riverRange.minMidi &&
    previous.riverRange.maxMidi === next.riverRange.maxMidi &&
    sameActiveNotes(previous.activeNotes, next.activeNotes),
);
