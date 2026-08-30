import { memo, useEffect, useRef, useState } from "react";
import { displayPlaybackBeat } from "../lib/playbackDisplayPosition";
import { activeNotesAt, usePracticeStore } from "../store/practiceStore";
import { PianoKeyboard } from "./PianoKeyboard";
import type { Hand } from "../lib/musicxml";

type ActiveNote = { midi: number; hand: Hand; pitchName: string };
type PracticeSnapshot = ReturnType<typeof usePracticeStore.getState>;

function activeNoteSignature(notes: ActiveNote[]): string {
  if (notes.length === 0) {
    return "";
  }

  let signature = "";
  for (const note of notes) {
    signature += `${note.midi}:${note.hand};`;
  }

  return signature;
}

export const KeyboardShell = memo(function KeyboardShell() {
  const [activeNotes, setActiveNotes] = useState<ActiveNote[]>(() =>
    activeNotesAt(
      usePracticeStore.getState().playbackEvents,
      usePracticeStore.getState().positionBeats,
    ),
  );
  const signatureRef = useRef(activeNoteSignature(activeNotes));
  const isPlaying = usePracticeStore((state) => state.isPlaying);
  const noteColors = usePracticeStore((state) => state.settings.noteColors);
  const showNoteNames = usePracticeStore((state) => state.settings.showNoteNames);
  const riverRange = usePracticeStore((state) => state.settings.riverRange);
  const volume = usePracticeStore((state) => state.settings.volume);

  useEffect(() => {
    const update = (state: PracticeSnapshot, positionBeats: number) => {
      const nextActiveNotes = activeNotesAt(state.playbackEvents, positionBeats);
      const nextSignature = activeNoteSignature(nextActiveNotes);
      if (nextSignature === signatureRef.current) {
        return;
      }

      signatureRef.current = nextSignature;
      setActiveNotes(nextActiveNotes);
    };

    // The roll animates on the extrapolated beat, so the keys have to follow the
    // same beat or they light up a commit behind the notes hitting the line.
    let frame: number | undefined;
    const tick = (frameTime: number) => {
      const state = usePracticeStore.getState();
      update(state, displayPlaybackBeat(state, frameTime));
      frame = window.requestAnimationFrame(tick);
    };
    if (isPlaying) {
      frame = window.requestAnimationFrame(tick);
    }

    update(usePracticeStore.getState(), usePracticeStore.getState().positionBeats);

    const unsubscribe = usePracticeStore.subscribe((nextState, previousState) => {
      if (
        nextState.positionBeats !== previousState.positionBeats ||
        nextState.playbackEvents !== previousState.playbackEvents
      ) {
        update(nextState, nextState.positionBeats);
      }
    });

    return () => {
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
      }
      unsubscribe();
    };
  }, [isPlaying]);

  return (
    <section className="keyboard-shell" aria-label="Piano keyboard">
      <PianoKeyboard
        activeNotes={activeNotes}
        noteColors={noteColors}
        riverRange={riverRange}
        showNoteNames={showNoteNames}
        volume={volume}
      />
    </section>
  );
});
