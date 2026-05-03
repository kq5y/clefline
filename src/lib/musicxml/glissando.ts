import type { NoteEvent } from "./types";

export type GlissandoSegment = {
  id: string;
  hand: string;
  startBeat: number;
  endBeat: number;
  startMidi: number;
  endMidi: number;
  startNote: NoteEvent;
  endNote: NoteEvent;
};

function glissandoNotation(note: NoteEvent, type: "start" | "stop") {
  return note.notations.find(
    (notation) =>
      (notation.type === "glissando" || notation.type === "slide") && notation.value === type,
  );
}

function glissandoKey(note: NoteEvent, number: string | undefined): string {
  return `${number ?? "1"}:${note.staff}:${note.voice}`;
}

export function buildGlissandoSegments(notes: NoteEvent[]): GlissandoSegment[] {
  const starts = new Map<string, NoteEvent>();
  const segments: GlissandoSegment[] = [];

  for (const note of notes) {
    const stop = glissandoNotation(note, "stop");
    if (stop) {
      const key = glissandoKey(note, stop.number);
      const start = starts.get(key);
      if (start) {
        segments.push({
          id: `${start.id}-${note.id}`,
          hand: start.hand === note.hand ? note.hand : "unknown",
          startBeat: start.startBeat,
          endBeat: note.startBeat,
          startMidi: start.midi,
          endMidi: note.midi,
          startNote: start,
          endNote: note,
        });
        starts.delete(key);
      }
    }

    const start = glissandoNotation(note, "start");
    if (start) {
      starts.set(glissandoKey(note, start.number), note);
    }
  }

  return segments;
}
