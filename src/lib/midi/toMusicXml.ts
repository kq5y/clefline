import type { ScoreModel, NoteEvent, MeasureModel, DirectionEvent } from "../musicxml/types";

const DIVISIONS = 480;

type NoteType = "whole" | "half" | "quarter" | "eighth" | "16th" | "32nd" | "64th";

function beatsToNoteType(beats: number): { type: NoteType; dots: number } {
  if (beats >= 3.5) return { type: "whole", dots: 0 };
  if (beats >= 2.5) return { type: "half", dots: 1 };
  if (beats >= 1.75) return { type: "half", dots: 0 };
  if (beats >= 1.25) return { type: "quarter", dots: 1 };
  if (beats >= 0.875) return { type: "quarter", dots: 0 };
  if (beats >= 0.625) return { type: "eighth", dots: 1 };
  if (beats >= 0.4375) return { type: "eighth", dots: 0 };
  if (beats >= 0.3125) return { type: "16th", dots: 1 };
  if (beats >= 0.21875) return { type: "16th", dots: 0 };
  if (beats >= 0.15625) return { type: "32nd", dots: 1 };
  if (beats >= 0.109375) return { type: "32nd", dots: 0 };
  return { type: "64th", dots: 0 };
}

function beatsToDivisions(beats: number): number {
  return Math.round(beats * DIVISIONS);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateNoteXml(
  note: NoteEvent,
  durationBeats: number,
  isChord: boolean,
  tieStart: boolean,
  tieStop: boolean
): string {
  const duration = beatsToDivisions(durationBeats);
  const { type, dots } = beatsToNoteType(durationBeats);
  const alter = note.alter !== 0 ? `<alter>${note.alter}</alter>` : "";

  let tieElements = "";
  let tiedNotations = "";
  if (tieStop) {
    tieElements += '<tie type="stop"/>';
    tiedNotations += '<tied type="stop"/>';
  }
  if (tieStart) {
    tieElements += '<tie type="start"/>';
    tiedNotations += '<tied type="start"/>';
  }

  const notations = tiedNotations ? `<notations>${tiedNotations}</notations>` : "";
  const dotElements = "<dot/>".repeat(dots);
  const chordTag = isChord ? "<chord/>" : "";

  return `<note>
${chordTag}<pitch><step>${note.step}</step>${alter}<octave>${note.octave}</octave></pitch>
<duration>${duration}</duration>
${tieElements}<type>${type}</type>${dotElements}
<staff>${note.staff}</staff>
<voice>${note.staff}</voice>
${notations}</note>`;
}

function generateRestXml(durationBeats: number, staff: number): string {
  const duration = beatsToDivisions(durationBeats);
  const { type, dots } = beatsToNoteType(durationBeats);
  const dotElements = "<dot/>".repeat(dots);

  return `<note>
<rest/>
<duration>${duration}</duration>
<type>${type}</type>${dotElements}
<staff>${staff}</staff>
<voice>${staff}</voice>
</note>`;
}

function generateBackupXml(durationBeats: number): string {
  const duration = beatsToDivisions(durationBeats);
  if (duration <= 0) return "";
  return `<backup><duration>${duration}</duration></backup>`;
}

function generateForwardXml(durationBeats: number, staff: number): string {
  const duration = beatsToDivisions(durationBeats);
  if (duration <= 0) return "";
  return `<forward><duration>${duration}</duration><staff>${staff}</staff><voice>${staff}</voice></forward>`;
}

type MeasureNotes = NoteEvent[];

function groupNotesByMeasure(
  notes: NoteEvent[],
  measures: MeasureModel[]
): Map<number, MeasureNotes> {
  const grouped = new Map<number, MeasureNotes>();

  for (const measure of measures) {
    grouped.set(measure.index, []);
  }

  for (const note of notes) {
    const measureNotes = grouped.get(note.measureIndex);
    if (measureNotes) {
      measureNotes.push(note);
    }
  }

  return grouped;
}

type NoteGroup = {
  beat: number;
  staff: number;
  notes: NoteEvent[];
  maxDuration: number;
};

function groupNotesAtSameTime(notes: NoteEvent[]): NoteGroup[] {
  if (notes.length === 0) return [];

  const sorted = notes.toSorted((a, b) => {
    if (Math.abs(a.startBeat - b.startBeat) > 0.001) return a.startBeat - b.startBeat;
    if (a.staff !== b.staff) return a.staff - b.staff;
    return b.midi - a.midi;
  });

  const groups: NoteGroup[] = [];
  let currentGroup: NoteGroup | null = null;

  for (const note of sorted) {
    if (
      !currentGroup ||
      Math.abs(note.startBeat - currentGroup.beat) > 0.001 ||
      note.staff !== currentGroup.staff
    ) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        beat: note.startBeat,
        staff: note.staff,
        notes: [note],
        maxDuration: note.durationBeats,
      };
    } else {
      currentGroup.notes.push(note);
      currentGroup.maxDuration = Math.max(currentGroup.maxDuration, note.durationBeats);
    }
  }

  if (currentGroup) groups.push(currentGroup);

  return groups;
}

function generateMeasureContent(
  measureNotes: NoteEvent[],
  measureStart: number,
  measureDuration: number
): string {
  const measureEnd = measureStart + measureDuration;
  const groups = groupNotesAtSameTime(measureNotes);
  const elements: string[] = [];

  if (groups.length === 0) {
    elements.push(generateRestXml(measureDuration, 1));
    elements.push(generateBackupXml(measureDuration));
    elements.push(generateRestXml(measureDuration, 2));
    return elements.join("\n");
  }

  const staff1Groups = groups.filter((g) => g.staff === 1);
  const staff2Groups = groups.filter((g) => g.staff === 2);

  elements.push(generateVoiceContent(staff1Groups, measureStart, measureEnd, 1));

  elements.push(generateBackupXml(measureDuration));

  elements.push(generateVoiceContent(staff2Groups, measureStart, measureEnd, 2));

  return elements.join("\n");
}

function generateVoiceContent(
  groups: NoteGroup[],
  measureStart: number,
  measureEnd: number,
  staff: number
): string {
  const elements: string[] = [];
  let currentBeat = measureStart;

  for (const group of groups) {
    if (group.beat > currentBeat + 0.001) {
      const gap = Math.min(group.beat - currentBeat, measureEnd - currentBeat);
      if (gap >= 0.03) {
        elements.push(generateForwardXml(gap, staff));
        currentBeat += gap;
      }
    }

    for (let i = 0; i < group.notes.length; i++) {
      const note = group.notes[i];
      const isChord = i > 0;
      const noteEnd = Math.min(note.startBeat + note.durationBeats, measureEnd);
      const effectiveDuration = Math.max(0.03, noteEnd - note.startBeat);
      elements.push(generateNoteXml(note, effectiveDuration, isChord, note.tieStart, note.tieStop));
    }

    const groupEnd = Math.min(group.beat + group.maxDuration, measureEnd);
    currentBeat = groupEnd;
  }

  if (currentBeat < measureEnd - 0.001) {
    const remaining = measureEnd - currentBeat;
    if (remaining >= 0.03) {
      elements.push(generateForwardXml(remaining, staff));
    }
  }

  return elements.join("\n");
}

type TimeSignature = { beats: number; beatType: number };

function generateAttributesXml(
  measure: MeasureModel,
  prevTimeSig: TimeSignature | undefined,
  isFirst: boolean
): string {
  const { beats, beatType } = measure.timeSignature;
  const timeSigChanged =
    !prevTimeSig || prevTimeSig.beats !== beats || prevTimeSig.beatType !== beatType;

  if (isFirst) {
    return `<attributes>
<divisions>${DIVISIONS}</divisions>
<key><fifths>0</fifths></key>
<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
<staves>2</staves>
<clef number="1"><sign>G</sign><line>2</line></clef>
<clef number="2"><sign>F</sign><line>4</line></clef>
</attributes>`;
  }

  if (timeSigChanged) {
    return `<attributes>
<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
</attributes>`;
  }

  return "";
}

function generateDirectionXml(tempo: number): string {
  return `<direction placement="above">
<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type>
<sound tempo="${tempo}"/>
</direction>`;
}

function generateMeasureXml(
  measure: MeasureModel,
  measureNotes: MeasureNotes,
  prevTimeSig: TimeSignature | undefined,
  isFirst: boolean,
  directions: DirectionEvent[],
  prevTempo: number | undefined
): { xml: string; tempo: number | undefined } {
  const attributes = generateAttributesXml(measure, prevTimeSig, isFirst);

  let directionXml = "";
  let newTempo = prevTempo;

  for (const dir of directions) {
    if (
      dir.kind === "tempo" &&
      dir.measureIndex === measure.index &&
      typeof dir.value === "number"
    ) {
      if (dir.value !== prevTempo) {
        directionXml += generateDirectionXml(dir.value);
        newTempo = dir.value;
      }
      break;
    }
  }

  const content = generateMeasureContent(
    measureNotes,
    measure.startBeat,
    measure.durationBeats
  );

  const xml = `<measure number="${measure.number}">
${attributes}${directionXml}
${content}
</measure>`;

  return { xml, tempo: newTempo };
}

export function scoreModelToMusicXml(score: ScoreModel): string {
  const title = escapeXml(score.metadata.title || "Untitled");
  const groupedNotes = groupNotesByMeasure(score.notes, score.measures);

  const measureXmls: string[] = [];
  let prevTimeSig: TimeSignature | undefined;
  let prevTempo: number | undefined;

  for (let i = 0; i < score.measures.length; i += 1) {
    const measure = score.measures[i];
    const notes = groupedNotes.get(measure.index) || [];

    const { xml, tempo } = generateMeasureXml(
      measure,
      notes,
      prevTimeSig,
      i === 0,
      score.directions,
      prevTempo
    );

    measureXmls.push(xml);
    prevTimeSig = measure.timeSignature;
    prevTempo = tempo;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
<work><work-title>${title}</work-title></work>
<identification>
<encoding><software>Clefline MIDI Import</software></encoding>
</identification>
<part-list>
<score-part id="P1"><part-name>Piano</part-name></score-part>
</part-list>
<part id="P1">
${measureXmls.join("\n")}
</part>
</score-partwise>`;
}
