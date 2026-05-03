import type { Hand, NoteEvent, PlaybackEvent, ScoreModel } from "./types";

export type TimelineOptions = {
  handMode?: "both" | "right" | "left";
};

function includeHand(note: NoteEvent, handMode: TimelineOptions["handMode"]): boolean {
  if (!handMode || handMode === "both") {
    return true;
  }

  return note.hand === handMode;
}

function notationLabels(notes: NoteEvent[]): string[] {
  return Array.from(
    new Set(notes.flatMap((note) => note.notations.map((notation) => notation.type))),
  );
}

export function buildPlaybackEvents(
  score: ScoreModel,
  options: TimelineOptions = {},
): PlaybackEvent[] {
  const grouped = new Map<string, NoteEvent[]>();

  for (const note of score.notes) {
    if (!includeHand(note, options.handMode) || note.tieStop) {
      continue;
    }

    const key = `${note.startBeat.toFixed(5)}:${note.staff}:${note.voice}`;
    grouped.set(key, [...(grouped.get(key) ?? []), note]);
  }

  return Array.from(grouped.values())
    .map((notes, index) => {
      const first = notes[0];
      const arpeggio = notes.some((note) =>
        note.notations.some((notation) => notation.type === "arpeggiate"),
      );
      const hand: Hand = notes.every((note) => note.hand === first.hand) ? first.hand : "unknown";

      return {
        id: `playback-${index}`,
        absoluteBeat: first.startBeat,
        sourceStartBeat: first.startBeat,
        durationBeats: Math.max(...notes.map((note) => note.durationBeats)),
        noteEventIds: notes.map((note) => note.id),
        notes,
        measureNumber: first.measureNumber,
        staff: first.staff,
        hand,
        velocity: 0.72,
        rollOffsetBeats: arpeggio ? 0.04 : 0,
        notationLabels: notationLabels(notes),
      };
    })
    .toSorted((a, b) => a.absoluteBeat - b.absoluteBeat || a.notes[0].midi - b.notes[0].midi);
}
