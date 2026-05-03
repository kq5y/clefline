import type { DirectionEvent, Hand, NoteEvent, PlaybackEvent, ScoreModel } from "./types";

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

const DYNAMIC_VELOCITY: Record<string, number> = {
  ppp: 0.28,
  pp: 0.36,
  p: 0.46,
  mp: 0.58,
  mf: 0.7,
  f: 0.82,
  ff: 0.92,
  fff: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function directionText(direction: DirectionEvent): string {
  return String(direction.value ?? direction.text ?? "")
    .trim()
    .toLowerCase();
}

function dynamicVelocity(direction: DirectionEvent): number | undefined {
  if (direction.kind !== "dynamic") {
    return undefined;
  }

  if (typeof direction.value === "number" && Number.isFinite(direction.value)) {
    return clamp(direction.value / 127, 0.25, 1);
  }

  return DYNAMIC_VELOCITY[directionText(direction)];
}

function baseDynamicVelocityAt(score: ScoreModel, beat: number): number {
  let velocity = 0.72;

  for (const direction of score.directions) {
    if (direction.beat > beat) {
      continue;
    }

    velocity = dynamicVelocity(direction) ?? velocity;
  }

  return velocity;
}

function nextExplicitDynamicVelocity(
  score: ScoreModel,
  startBeat: number,
  endBeat: number,
): number | undefined {
  const direction = score.directions.find(
    (item) => item.beat > startBeat && item.beat <= endBeat && dynamicVelocity(item) !== undefined,
  );

  return direction ? dynamicVelocity(direction) : undefined;
}

function wedgeVelocityAt(score: ScoreModel, beat: number, baseVelocity: number): number {
  const wedgeStart = score.directions.findLast(
    (direction) =>
      direction.kind === "wedge" &&
      direction.beat <= beat &&
      !["stop", "continue"].includes(directionText(direction)),
  );
  if (!wedgeStart) {
    return baseVelocity;
  }

  const wedgeStop = score.directions.find(
    (direction) =>
      direction.kind === "wedge" &&
      direction.beat > wedgeStart.beat &&
      directionText(direction) === "stop",
  );
  const endBeat = wedgeStop?.beat ?? wedgeStart.beat + 4;
  if (beat > endBeat) {
    return baseVelocity;
  }

  const startVelocity = baseDynamicVelocityAt(score, wedgeStart.beat);
  const fallbackTarget = /crescendo/.test(directionText(wedgeStart))
    ? startVelocity + 0.18
    : startVelocity - 0.18;
  const endVelocity =
    nextExplicitDynamicVelocity(score, wedgeStart.beat, endBeat) ?? clamp(fallbackTarget, 0.25, 1);
  const progress = clamp((beat - wedgeStart.beat) / Math.max(0.1, endBeat - wedgeStart.beat), 0, 1);

  return clamp(startVelocity + (endVelocity - startVelocity) * progress, 0.18, 1);
}

function performanceVelocity(score: ScoreModel, notes: NoteEvent[]): number {
  const beat = notes[0]?.startBeat ?? 0;
  const baseVelocity = wedgeVelocityAt(score, beat, baseDynamicVelocityAt(score, beat));
  let scale = 1;

  if (hasNotation(notes, "accent")) {
    scale *= 1.12;
  }
  if (hasNotation(notes, "strong-accent")) {
    scale *= 1.22;
  }
  if (notes.some((note) => note.isGrace)) {
    scale *= hasLongGrace(notes) ? 0.82 : 0.58;
  }

  return clamp(baseVelocity * scale, 0.08, 1);
}

function hasNotation(notes: NoteEvent[], type: string): boolean {
  return notes.some((note) => note.notations.some((notation) => notation.type === type));
}

function performanceDuration(notes: NoteEvent[]): number {
  const durationBeats = Math.max(...notes.map((note) => note.durationBeats));
  if (notes.some((note) => note.isGrace)) {
    return hasLongGrace(notes)
      ? clamp(durationBeats || 0.28, 0.24, 0.45)
      : Math.min(durationBeats || 0.14, 0.14);
  }
  if (hasNotation(notes, "staccatissimo")) {
    return durationBeats * 0.32;
  }
  if (hasNotation(notes, "staccato")) {
    return durationBeats * 0.45;
  }
  if (hasNotation(notes, "tenuto")) {
    return durationBeats * 1.02;
  }

  return durationBeats;
}

function hasLongGrace(notes: NoteEvent[]): boolean {
  return notes.some((note) =>
    note.notations.some((notation) => notation.type === "grace" && notation.value === "long"),
  );
}

function graceLeadInBeats(notes: NoteEvent[]): number {
  if (!notes.some((note) => note.isGrace)) {
    return 0;
  }

  return hasLongGrace(notes) ? 0.32 : 0.14;
}

function beatKey(beat: number): string {
  return beat.toFixed(5);
}

function isArpeggioNote(note: NoteEvent): boolean {
  return note.notations.some((notation) => notation.type === "arpeggiate");
}

function arpeggioDirection(notes: NoteEvent[]): "up" | "down" {
  return notes.some((note) =>
    note.notations.some((notation) => notation.type === "arpeggiate" && notation.value === "down"),
  )
    ? "down"
    : "up";
}

export function buildPlaybackEvents(
  score: ScoreModel,
  options: TimelineOptions = {},
): PlaybackEvent[] {
  const grouped = new Map<string, NoteEvent[]>();
  const arpeggioBeats = new Set(
    score.notes.filter(isArpeggioNote).map((note) => beatKey(note.startBeat)),
  );

  for (const note of score.notes) {
    if (!includeHand(note, options.handMode) || note.tieStop) {
      continue;
    }

    const startKey = beatKey(note.startBeat);
    const graceKey = note.isGrace
      ? `grace:${note.notations.find((notation) => notation.type === "grace")?.value ?? "short"}`
      : "main";
    const key =
      arpeggioBeats.has(startKey) && !note.isGrace
        ? `${startKey}:arpeggio`
        : `${startKey}:${note.staff}:${note.voice}:${graceKey}`;
    grouped.set(key, [...(grouped.get(key) ?? []), note]);
  }

  return Array.from(grouped.values())
    .map((notes, index) => {
      const arpeggio = notes.some(isArpeggioNote);
      const orderedNotes = arpeggio
        ? notes.toSorted((a, b) =>
            arpeggioDirection(notes) === "down" ? b.midi - a.midi : a.midi - b.midi,
          )
        : notes;
      const first = orderedNotes[0];
      const hand: Hand = notes.every((note) => note.hand === first.hand) ? first.hand : "unknown";
      const sourceStartBeat = Math.min(...orderedNotes.map((note) => note.startBeat));

      return {
        id: `playback-${index}`,
        absoluteBeat: sourceStartBeat - graceLeadInBeats(orderedNotes),
        sourceStartBeat,
        durationBeats: performanceDuration(orderedNotes),
        noteEventIds: orderedNotes.map((note) => note.id),
        notes: orderedNotes,
        measureNumber: first.measureNumber,
        staff: first.staff,
        hand,
        velocity: performanceVelocity(score, orderedNotes),
        rollOffsetBeats: arpeggio ? 0.055 : 0,
        notationLabels: notationLabels(orderedNotes),
      };
    })
    .toSorted((a, b) => a.absoluteBeat - b.absoluteBeat || a.notes[0].midi - b.notes[0].midi);
}
