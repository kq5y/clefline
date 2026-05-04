import { buildGlissandoSegments } from "./glissando";
import { midiToPitchName } from "./pitch";
import type { DirectionEvent, Hand, NoteEvent, PlaybackEvent, ScoreModel } from "./types";

export type TimelineOptions = {
  handMode?: "both" | "right" | "left";
};

export type PlaybackSection = {
  performanceStartBeat: number;
  sourceEndBeat: number;
  sourceStartBeat: number;
};

export type MetronomeClick = {
  absoluteBeat: number;
  sourceBeat: number;
  accented: boolean;
  measureNumber: string;
};

function includeHand(note: NoteEvent, handMode: TimelineOptions["handMode"]): boolean {
  if (!handMode || handMode === "both") {
    return true;
  }

  return note.hand === handMode;
}

function notationLabels(notes: NoteEvent[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const note of notes) {
    for (const notation of note.notations) {
      if (!seen.has(notation.type)) {
        seen.add(notation.type);
        labels.push(notation.type);
      }
    }
  }

  return labels;
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

function directionIndexAtOrBefore(directions: DirectionEvent[], beat: number): number {
  let low = 0;
  let high = directions.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (directions[middle].beat <= beat) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match;
}

function baseDynamicVelocityAt(score: ScoreModel, beat: number): number {
  const index = directionIndexAtOrBefore(score.directions, beat);
  if (index < 0) {
    return 0.72;
  }

  for (let i = index; i >= 0; i -= 1) {
    const velocity = dynamicVelocity(score.directions[i]);
    if (velocity !== undefined) {
      return velocity;
    }
  }

  return 0.72;
}

function directionIndexAfter(directions: DirectionEvent[], beat: number): number {
  let low = 0;
  let high = directions.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (directions[middle].beat <= beat) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function nextExplicitDynamicVelocity(
  score: ScoreModel,
  startBeat: number,
  endBeat: number,
): number | undefined {
  const startIndex = directionIndexAfter(score.directions, startBeat);
  for (let i = startIndex; i < score.directions.length; i += 1) {
    const direction = score.directions[i];
    if (direction.beat > endBeat) {
      break;
    }
    const velocity = dynamicVelocity(direction);
    if (velocity !== undefined) {
      return velocity;
    }
  }

  return undefined;
}

function wedgeVelocityAt(score: ScoreModel, beat: number, baseVelocity: number): number {
  const index = directionIndexAtOrBefore(score.directions, beat);
  let wedgeStart: DirectionEvent | undefined;

  for (let i = index; i >= 0; i -= 1) {
    const direction = score.directions[i];
    if (
      direction.kind === "wedge" &&
      !["stop", "continue"].includes(directionText(direction))
    ) {
      wedgeStart = direction;
      break;
    }
  }

  if (!wedgeStart) {
    return baseVelocity;
  }

  const stopStartIndex = directionIndexAfter(score.directions, wedgeStart.beat);
  let wedgeStop: DirectionEvent | undefined;
  for (let i = stopStartIndex; i < score.directions.length; i += 1) {
    const direction = score.directions[i];
    if (direction.kind === "wedge" && directionText(direction) === "stop") {
      wedgeStop = direction;
      break;
    }
  }
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

function isSortedByStartBeat(group: NoteEvent[]): boolean {
  for (let i = 1; i < group.length; i += 1) {
    if (group[i - 1].startBeat > group[i].startBeat) {
      return false;
    }
  }
  return true;
}

function buildTiedDurationMap(notes: NoteEvent[]): Map<string, number> {
  const groups = new Map<string, NoteEvent[]>();
  const durations = new Map<string, number>();

  for (const note of notes) {
    if (!note.tieGroupId) {
      continue;
    }

    const group = groups.get(note.tieGroupId);
    if (group) {
      group.push(note);
    } else {
      groups.set(note.tieGroupId, [note]);
    }
  }

  for (const group of groups.values()) {
    let chainStart: NoteEvent | undefined;
    let chainDuration = 0;
    const sorted =
      group.length <= 1 || isSortedByStartBeat(group)
        ? group
        : group.toSorted((a, b) => a.startBeat - b.startBeat);
    for (const note of sorted) {
      chainStart ??= note;
      chainDuration += note.durationBeats;

      if (!note.tieStart) {
        if (chainDuration > chainStart.durationBeats) {
          durations.set(chainStart.id, chainDuration);
        }
        chainStart = undefined;
        chainDuration = 0;
      }
    }

    if (chainStart && chainDuration > chainStart.durationBeats) {
      durations.set(chainStart.id, chainDuration);
    }
  }

  return durations;
}

function playbackDuration(note: NoteEvent, tiedDurations: Map<string, number>): number {
  return tiedDurations.get(note.id) ?? note.durationBeats;
}

function performanceDuration(notes: NoteEvent[], tiedDurations: Map<string, number>): number {
  const durationBeats = Math.max(...notes.map((note) => playbackDuration(note, tiedDurations)));
  if (notes.some((note) => tiedDurations.has(note.id))) {
    return durationBeats;
  }
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

function buildSourcePlaybackEvents(
  score: ScoreModel,
  options: TimelineOptions = {},
): PlaybackEvent[] {
  const grouped = new Map<string, NoteEvent[]>();
  const tiedDurations = buildTiedDurationMap(score.notes);
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
    const group = grouped.get(key);
    if (group) {
      group.push(note);
    } else {
      grouped.set(key, [note]);
    }
  }

  const baseEvents: PlaybackEvent[] = [];
  let index = 0;
  for (const notes of grouped.values()) {
    const arpeggio = notes.some(isArpeggioNote);
    const orderedNotes = arpeggio
      ? notes.toSorted((a, b) =>
          arpeggioDirection(notes) === "down" ? b.midi - a.midi : a.midi - b.midi,
        )
      : notes;
    const first = orderedNotes[0];
    const hand: Hand = notes.every((note) => note.hand === first.hand) ? first.hand : "unknown";
    const sourceStartBeat = Math.min(...orderedNotes.map((note) => note.startBeat));

    baseEvents.push({
      id: `playback-${index}`,
      absoluteBeat: sourceStartBeat - graceLeadInBeats(orderedNotes),
      sourceStartBeat,
      durationBeats: performanceDuration(orderedNotes, tiedDurations),
      noteEventIds: orderedNotes.map((note) => note.id),
      notes: orderedNotes,
      measureNumber: first.measureNumber,
      staff: first.staff,
      hand,
      velocity: performanceVelocity(score, orderedNotes),
      rollOffsetBeats: arpeggio ? 0.055 : 0,
      notationLabels: notationLabels(orderedNotes),
    });
    index += 1;
  }
  baseEvents.sort((a, b) => a.absoluteBeat - b.absoluteBeat || a.notes[0].midi - b.notes[0].midi);

  return withGlissandoPlayback(score, options, baseEvents);
}

function syntheticGlissandoNote(source: NoteEvent, midi: number): NoteEvent {
  return {
    ...source,
    id: `${source.id}-gliss-${midi}`,
    midi,
    pitchName: midiToPitchName(midi),
    durationBeats: 0.08,
    isChordTone: false,
    notations: [{ type: "glissando", value: "playback" }],
    tieStart: false,
    tieStop: false,
    tieGroupId: undefined,
  };
}

function withGlissandoPlayback(
  score: ScoreModel,
  options: TimelineOptions,
  events: PlaybackEvent[],
): PlaybackEvent[] {
  const glissandoEvents: PlaybackEvent[] = [];

  for (const segment of buildGlissandoSegments(score.notes)) {
    if (
      !includeHand(segment.startNote, options.handMode) ||
      !includeHand(segment.endNote, options.handMode)
    ) {
      continue;
    }

    const direction = Math.sign(segment.endMidi - segment.startMidi);
    const semitoneDistance = Math.abs(segment.endMidi - segment.startMidi);
    if (direction === 0 || semitoneDistance < 2) {
      continue;
    }

    const beatSpan = Math.max(0.12, segment.endBeat - segment.startBeat);
    const generatedCount = Math.min(semitoneDistance - 1, 36);
    const midiStep = semitoneDistance > 36 ? semitoneDistance / (generatedCount + 1) : 1;
    for (let index = 1; index <= generatedCount; index += 1) {
      const midi =
        segment.startMidi +
        direction * Math.round(Math.min(semitoneDistance - 1, index * midiStep));
      const progress = index / (generatedCount + 1);
      const absoluteBeat = segment.startBeat + beatSpan * progress;
      const note = syntheticGlissandoNote(segment.startNote, midi);
      glissandoEvents.push({
        id: `gliss-${segment.id}-${index}`,
        absoluteBeat,
        sourceStartBeat: absoluteBeat,
        durationBeats: Math.min(0.1, beatSpan / (generatedCount + 1)),
        noteEventIds: [note.id],
        notes: [note],
        measureNumber: segment.startNote.measureNumber,
        staff: segment.startNote.staff,
        hand: segment.hand as Hand,
        velocity: performanceVelocity(score, [segment.startNote]) * 0.7,
        rollOffsetBeats: 0,
        notationLabels: ["glissando"],
      });
    }
  }

  const combined = events.concat(glissandoEvents);
  combined.sort((a, b) => a.absoluteBeat - b.absoluteBeat || a.notes[0].midi - b.notes[0].midi);

  return combined;
}

function directionValue(direction: DirectionEvent): string {
  return String(direction.text ?? direction.value ?? "")
    .trim()
    .toLowerCase();
}

function hasDirection(direction: DirectionEvent, pattern: RegExp): boolean {
  return (
    direction.kind === "repeat-navigation" &&
    (pattern.test(directionValue(direction)) || pattern.test(String(direction.text ?? "")))
  );
}

function firstBeat(score: ScoreModel, predicate: (direction: DirectionEvent) => boolean) {
  return score.directions.find(predicate)?.beat;
}

function measureEndBeat(measure: ScoreModel["measures"][number]): number {
  return measure.startBeat + measure.durationBeats;
}

function metronomeUnitBeats(measure: ScoreModel["measures"][number]): number {
  const beatType = measure.timeSignature.beatType;

  return beatType > 0 ? 4 / beatType : 1;
}

function appendSourceSection(
  sections: Array<{ start: number; end: number }>,
  start: number,
  end: number,
): void {
  if (end <= start) {
    return;
  }

  const previous = sections.at(-1);
  if (previous && previous.end === start) {
    previous.end = end;
    return;
  }

  sections.push({ start, end });
}

function firstEndingStartBeat(
  score: ScoreModel,
  repeatStartBeat: number,
  repeatEndBeat: number,
): number | undefined {
  return score.measures.find(
    (measure) =>
      measure.startBeat >= repeatStartBeat &&
      measure.startBeat < repeatEndBeat &&
      measure.endings.includes("1"),
  )?.startBeat;
}

function repeatExpandedSourceSections(score: ScoreModel): Array<{ start: number; end: number }> {
  const sections: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  let repeatStartBeat = 0;

  for (const measure of score.measures) {
    if (measure.repeatStart) {
      repeatStartBeat = measure.startBeat;
    }

    if (!measure.repeatEnd) {
      continue;
    }

    const repeatEndBeat = measureEndBeat(measure);
    appendSourceSection(sections, cursor, repeatEndBeat);

    const secondPassEndBeat =
      firstEndingStartBeat(score, repeatStartBeat, repeatEndBeat) ?? repeatEndBeat;
    appendSourceSection(sections, repeatStartBeat, secondPassEndBeat);

    cursor = repeatEndBeat;
    repeatStartBeat = repeatEndBeat;
  }

  appendSourceSection(sections, cursor, score.totalBeats);

  return sections.length > 0 ? sections : [{ start: 0, end: score.totalBeats }];
}

function sourceSectionsInRange(
  sections: Array<{ start: number; end: number }>,
  startBeat: number,
  endBeat: number,
): Array<{ start: number; end: number }> {
  const sliced: Array<{ start: number; end: number }> = [];
  for (const section of sections) {
    const start = Math.max(section.start, startBeat);
    const end = Math.min(section.end, endBeat);
    appendSourceSection(sliced, start, end);
  }

  return sliced;
}

function copyEventsInSection(
  events: PlaybackEvent[],
  sourceStart: number,
  sourceEnd: number,
  performanceStart: number,
  sectionIndex: number,
): PlaybackEvent[] {
  return events
    .filter((event) => event.sourceStartBeat >= sourceStart && event.sourceStartBeat < sourceEnd)
    .map((event) => ({
      ...event,
      id: `${event.id}-nav-${sectionIndex}`,
      absoluteBeat: performanceStart + (event.absoluteBeat - sourceStart),
    }));
}

function navigationSourceSections(score: ScoreModel): Array<{ start: number; end: number }> {
  const repeatedSections = repeatExpandedSourceSections(score);
  const dsBeat = firstBeat(score, (direction) => hasDirection(direction, /dalsegno|d\.s\./i));
  const dcBeat = firstBeat(score, (direction) => hasDirection(direction, /dacapo|d\.c\./i));
  const jumpBeat = dsBeat ?? dcBeat;
  if (jumpBeat === undefined) {
    return repeatedSections;
  }

  const jumpText = score.directions
    .filter((direction) => direction.beat === jumpBeat && direction.kind === "repeat-navigation")
    .map(directionValue)
    .join(" ");
  const targetBeat =
    dsBeat !== undefined ? (firstBeat(score, (direction) => direction.kind === "segno") ?? 0) : 0;
  const toCodaBeat = firstBeat(score, (direction) => hasDirection(direction, /tocoda|to\s+coda/i));
  const codaBeat = firstBeat(score, (direction) => direction.kind === "coda");
  const fineBeat = firstBeat(score, (direction) => hasDirection(direction, /^fine$|al\s+fine/i));

  const useCoda = /coda/.test(jumpText) && toCodaBeat !== undefined && codaBeat !== undefined;
  const repeatEnd = useCoda ? toCodaBeat : (fineBeat ?? score.totalBeats);

  if (repeatEnd <= targetBeat || jumpBeat <= 0) {
    return repeatedSections;
  }

  const sections: Array<{ start: number; end: number }> = [
    ...sourceSectionsInRange(repeatedSections, 0, jumpBeat),
    ...sourceSectionsInRange(repeatedSections, targetBeat, repeatEnd),
  ];
  if (useCoda) {
    sections.push(...sourceSectionsInRange(repeatedSections, codaBeat, score.totalBeats));
  }

  return sections;
}

export function buildPlaybackSections(score: ScoreModel): PlaybackSection[] {
  let performanceStart = 0;
  return navigationSourceSections(score).map((section) => {
    const playbackSection = {
      performanceStartBeat: performanceStart,
      sourceEndBeat: section.end,
      sourceStartBeat: section.start,
    };
    performanceStart += section.end - section.start;

    return playbackSection;
  });
}

export function buildMetronomeClicks(score: ScoreModel): MetronomeClick[] {
  const clicks: MetronomeClick[] = [];
  for (const section of buildPlaybackSections(score)) {
    for (const measure of score.measures) {
      const sourceStart = Math.max(measure.startBeat, section.sourceStartBeat);
      const sourceEnd = Math.min(measureEndBeat(measure), section.sourceEndBeat);
      if (sourceEnd <= sourceStart) {
        continue;
      }

      const unitBeats = metronomeUnitBeats(measure);
      const firstIndex = Math.ceil((sourceStart - measure.startBeat - 0.0001) / unitBeats);
      for (
        let sourceBeat = measure.startBeat + Math.max(0, firstIndex) * unitBeats;
        sourceBeat < sourceEnd - 0.0001;
        sourceBeat += unitBeats
      ) {
        clicks.push({
          absoluteBeat: section.performanceStartBeat + (sourceBeat - section.sourceStartBeat),
          sourceBeat,
          accented: Math.abs(sourceBeat - measure.startBeat) < 0.001,
          measureNumber: measure.number,
        });
      }
    }
  }

  clicks.sort(
    (first, second) =>
      first.absoluteBeat - second.absoluteBeat || first.sourceBeat - second.sourceBeat,
  );

  return clicks;
}

function expandNavigation(score: ScoreModel, events: PlaybackEvent[]): PlaybackEvent[] {
  const sections = buildPlaybackSections(score);
  if (
    sections.length === 1 &&
    sections[0].sourceStartBeat === 0 &&
    sections[0].sourceEndBeat === score.totalBeats &&
    sections[0].performanceStartBeat === 0
  ) {
    return events;
  }

  const expanded: PlaybackEvent[] = [];
  for (const [sectionIndex, section] of sections.entries()) {
    expanded.push(
      ...copyEventsInSection(
        events,
        section.sourceStartBeat,
        section.sourceEndBeat,
        section.performanceStartBeat,
        sectionIndex,
      ),
    );
  }

  expanded.sort((a, b) => a.absoluteBeat - b.absoluteBeat || a.notes[0].midi - b.notes[0].midi);

  return expanded;
}

export function buildPlaybackEvents(
  score: ScoreModel,
  options: TimelineOptions = {},
): PlaybackEvent[] {
  return expandNavigation(score, buildSourcePlaybackEvents(score, options));
}
