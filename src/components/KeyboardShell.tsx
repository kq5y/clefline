import { memo, useEffect, useRef, useState } from "react";
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

function activeNotesForState(state: PracticeSnapshot): ActiveNote[] {
  return activeNotesAt(state.playbackEvents, state.positionBeats);
}

export const KeyboardShell = memo(function KeyboardShell() {
  const [activeNotes, setActiveNotes] = useState(() =>
    activeNotesForState(usePracticeStore.getState()),
  );
  const signatureRef = useRef(activeNoteSignature(activeNotes));
  const showNoteNames = usePracticeStore((state) => state.settings.showNoteNames);
  const riverRange = usePracticeStore((state) => state.settings.riverRange);
  const volume = usePracticeStore((state) => state.settings.volume);

  useEffect(() => {
    const update = (state: PracticeSnapshot) => {
      const nextActiveNotes = activeNotesForState(state);
      const nextSignature = activeNoteSignature(nextActiveNotes);
      if (nextSignature === signatureRef.current) {
        return;
      }

      signatureRef.current = nextSignature;
      setActiveNotes(nextActiveNotes);
    };

    update(usePracticeStore.getState());

    return usePracticeStore.subscribe((nextState, previousState) => {
      if (
        nextState.positionBeats !== previousState.positionBeats ||
        nextState.playbackEvents !== previousState.playbackEvents
      ) {
        update(nextState);
      }
    });
  }, []);

  return (
    <section className="keyboard-shell" aria-label="Piano keyboard">
      <PianoKeyboard
        activeNotes={activeNotes}
        riverRange={riverRange}
        showNoteNames={showNoteNames}
        volume={volume}
      />
    </section>
  );
});
