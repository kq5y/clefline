import type { ScoreModel, NoteEvent, MeasureModel } from "../musicxml/types";

const DIVISIONS = 480;

type NoteType =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "16th"
  | "32nd"
  | "64th";

type DurationMapping = {
  maxBeats: number;
  type: NoteType;
  duration: number;
  dots: number;
};

const DURATION_MAP: DurationMapping[] = [
  { maxBeats: 6, type: "whole", duration: DIVISIONS * 4, dots: 1 },
  { maxBeats: 4, type: "whole", duration: DIVISIONS * 4, dots: 0 },
  { maxBeats: 3, type: "half", duration: DIVISIONS * 2, dots: 1 },
  { maxBeats: 2, type: "half", duration: DIVISIONS * 2, dots: 0 },
  { maxBeats: 1.5, type: "quarter", duration: DIVISIONS, dots: 1 },
  { maxBeats: 1, type: "quarter", duration: DIVISIONS, dots: 0 },
  { maxBeats: 0.75, type: "eighth", duration: DIVISIONS / 2, dots: 1 },
  { maxBeats: 0.5, type: "eighth", duration: DIVISIONS / 2, dots: 0 },
  { maxBeats: 0.375, type: "16th", duration: DIVISIONS / 4, dots: 1 },
  { maxBeats: 0.25, type: "16th", duration: DIVISIONS / 4, dots: 0 },
  { maxBeats: 0.1875, type: "32nd", duration: DIVISIONS / 8, dots: 1 },
  { maxBeats: 0.125, type: "32nd", duration: DIVISIONS / 8, dots: 0 },
  { maxBeats: 0, type: "64th", duration: DIVISIONS / 16, dots: 0 },
];

function beatsToDuration(beats: number): { type: NoteType; duration: number; dots: number } {
  for (const mapping of DURATION_MAP) {
    if (beats >= mapping.maxBeats * 0.9) {
      return { type: mapping.type, duration: mapping.duration, dots: mapping.dots };
    }
  }
  return { type: "64th", duration: DIVISIONS / 16, dots: 0 };
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
  isChord: boolean,
  tieStart: boolean,
  tieStop: boolean
): string {
  const { type, duration, dots } = beatsToDuration(note.durationBeats);
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
  const { type, duration, dots } = beatsToDuration(durationBeats);
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
  const duration = Math.round(durationBeats * DIVISIONS);
  return `<backup><duration>${duration}</duration></backup>`;
}

type MeasureNotes = {
  staff1: NoteEvent[];
  staff2: NoteEvent[];
};

function groupNotesByMeasureAndStaff(
  notes: NoteEvent[],
  measures: MeasureModel[]
): Map<number, MeasureNotes> {
  const grouped = new Map<number, MeasureNotes>();

  for (const measure of measures) {
    grouped.set(measure.index, { staff1: [], staff2: [] });
  }

  for (const note of notes) {
    const measureNotes = grouped.get(note.measureIndex);
    if (measureNotes) {
      if (note.staff === 1) {
        measureNotes.staff1.push(note);
      } else {
        measureNotes.staff2.push(note);
      }
    }
  }

  return grouped;
}

function generateStaffVoice(
  staffNotes: NoteEvent[],
  measureStart: number,
  measureDuration: number,
  staff: number
): string {
  if (staffNotes.length === 0) {
    return generateRestXml(measureDuration, staff);
  }

  const sorted = staffNotes.toSorted((a, b) => a.startBeat - b.startBeat || b.midi - a.midi);
  const elements: string[] = [];
  let currentBeat = measureStart;

  let i = 0;
  while (i < sorted.length) {
    const note = sorted[i];
    const noteStart = note.startBeat;

    if (noteStart > currentBeat + 0.01) {
      const gap = noteStart - currentBeat;
      if (gap >= 0.125) {
        elements.push(generateRestXml(gap, staff));
      }
      currentBeat = noteStart;
    }

    const chordNotes: NoteEvent[] = [note];
    let j = i + 1;
    while (j < sorted.length && Math.abs(sorted[j].startBeat - noteStart) < 0.01) {
      chordNotes.push(sorted[j]);
      j += 1;
    }

    for (let k = 0; k < chordNotes.length; k += 1) {
      const n = chordNotes[k];
      const isChord = k > 0;
      elements.push(generateNoteXml(n, isChord, n.tieStart, n.tieStop));
    }

    const maxEnd = Math.max(...chordNotes.map((n) => n.startBeat + n.durationBeats));
    currentBeat = maxEnd;
    i = j;
  }

  const measureEnd = measureStart + measureDuration;
  if (currentBeat < measureEnd - 0.01) {
    const remaining = measureEnd - currentBeat;
    if (remaining >= 0.125) {
      elements.push(generateRestXml(remaining, staff));
    }
  }

  return elements.join("\n");
}

function generateMeasureXml(
  measure: MeasureModel,
  measureNotes: MeasureNotes,
  isFirst: boolean
): string {
  const { beats, beatType } = measure.timeSignature;

  let attributes = "";
  if (isFirst) {
    attributes = `<attributes>
<divisions>${DIVISIONS}</divisions>
<key><fifths>0</fifths></key>
<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
<staves>2</staves>
<clef number="1"><sign>G</sign><line>2</line></clef>
<clef number="2"><sign>F</sign><line>4</line></clef>
</attributes>`;
  }

  const staff1Voice = generateStaffVoice(
    measureNotes.staff1,
    measure.startBeat,
    measure.durationBeats,
    1
  );

  const backup = generateBackupXml(measure.durationBeats);

  const staff2Voice = generateStaffVoice(
    measureNotes.staff2,
    measure.startBeat,
    measure.durationBeats,
    2
  );

  return `<measure number="${measure.number}">
${attributes}
${staff1Voice}
${backup}
${staff2Voice}
</measure>`;
}

export function scoreModelToMusicXml(score: ScoreModel): string {
  const title = escapeXml(score.metadata.title || "Untitled");
  const groupedNotes = groupNotesByMeasureAndStaff(score.notes, score.measures);

  const measureXmls: string[] = [];
  for (let i = 0; i < score.measures.length; i += 1) {
    const measure = score.measures[i];
    const notes = groupedNotes.get(measure.index) || { staff1: [], staff2: [] };
    measureXmls.push(generateMeasureXml(measure, notes, i === 0));
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
