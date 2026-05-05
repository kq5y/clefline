import { describe, expect, it } from "vitest";
import { scoreModelToMusicXml } from "./toMusicXml";
import type { ScoreModel, NoteEvent, MeasureModel } from "../musicxml/types";

function createMeasure(overrides: Partial<MeasureModel> = {}): MeasureModel {
  return {
    index: 0,
    number: "1",
    startBeat: 0,
    durationBeats: 4,
    timeSignature: { beats: 4, beatType: 4 },
    repeatStart: false,
    repeatEnd: false,
    endings: [],
    ...overrides,
  };
}

function createNote(overrides: Partial<NoteEvent> = {}): NoteEvent {
  return {
    id: "note-1",
    midi: 60,
    pitchName: "C4",
    step: "C",
    alter: 0,
    octave: 4,
    staff: 1,
    hand: "right",
    voice: "1",
    startBeat: 0,
    durationBeats: 1,
    measureIndex: 0,
    measureNumber: "1",
    isGrace: false,
    isChordTone: false,
    tieStart: false,
    tieStop: false,
    notations: [],
    ...overrides,
  };
}

function createScore(overrides: Partial<ScoreModel> = {}): ScoreModel {
  return {
    metadata: { title: "Test Score" },
    measures: [createMeasure()],
    notes: [],
    directions: [],
    pedals: [],
    warnings: [],
    totalBeats: 4,
    rawXml: "",
    ...overrides,
  };
}

describe("scoreModelToMusicXml", () => {
  it("generates valid MusicXML structure", () => {
    const score = createScore();
    const xml = scoreModelToMusicXml(score);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("score-partwise");
    expect(xml).toContain("<part-list>");
    expect(xml).toContain('<part id="P1">');
  });

  it("includes title in work element", () => {
    const score = createScore({ metadata: { title: "My Song" } });
    const xml = scoreModelToMusicXml(score);

    expect(xml).toContain("<work-title>My Song</work-title>");
  });

  it("escapes special XML characters in title", () => {
    const score = createScore({ metadata: { title: "Song & Dance <2>" } });
    const xml = scoreModelToMusicXml(score);

    expect(xml).toContain("Song &amp; Dance &lt;2&gt;");
  });

  it("generates measure with attributes", () => {
    const score = createScore({
      measures: [createMeasure({ number: "1", timeSignature: { beats: 3, beatType: 4 } })],
    });
    const xml = scoreModelToMusicXml(score);

    expect(xml).toContain('<measure number="1">');
    expect(xml).toContain("<divisions>");
    expect(xml).toContain("<beats>3</beats>");
    expect(xml).toContain("<beat-type>4</beat-type>");
    expect(xml).toContain("<staves>2</staves>");
  });

  it("generates notes with correct pitch", () => {
    const score = createScore({
      notes: [createNote({ midi: 64, step: "E", alter: 0, octave: 4 })],
    });
    const xml = scoreModelToMusicXml(score);

    expect(xml).toContain("<step>E</step>");
    expect(xml).toContain("<octave>4</octave>");
  });

  it("generates sharp notes with alter element", () => {
    const score = createScore({
      notes: [createNote({ midi: 61, step: "C", alter: 1, octave: 4 })],
    });
    const xml = scoreModelToMusicXml(score);

    expect(xml).toContain("<alter>1</alter>");
  });

  it("generates notes on both staves", () => {
    const score = createScore({
      notes: [
        createNote({ id: "n1", staff: 1, midi: 72 }),
        createNote({ id: "n2", staff: 2, midi: 48 }),
      ],
    });
    const xml = scoreModelToMusicXml(score);

    expect(xml).toContain("<staff>1</staff>");
    expect(xml).toContain("<staff>2</staff>");
    expect(xml).toContain("<backup>");
  });

  it("generates chords for simultaneous notes", () => {
    const score = createScore({
      notes: [
        createNote({ id: "n1", midi: 60, startBeat: 0 }),
        createNote({ id: "n2", midi: 64, startBeat: 0 }),
        createNote({ id: "n3", midi: 67, startBeat: 0 }),
      ],
    });
    const xml = scoreModelToMusicXml(score);

    expect(xml.match(/<chord\/>/g)?.length).toBe(2);
  });

  it("generates forward for gaps", () => {
    const score = createScore({
      measures: [createMeasure({ durationBeats: 4 })],
      notes: [createNote({ startBeat: 2, durationBeats: 1 })],
    });
    const xml = scoreModelToMusicXml(score);

    expect(xml).toContain("<forward>");
  });

  it("generates ties", () => {
    const score = createScore({
      notes: [
        createNote({ id: "n1", startBeat: 0, durationBeats: 1, tieStart: true }),
        createNote({ id: "n2", startBeat: 1, durationBeats: 1, tieStop: true }),
      ],
    });
    const xml = scoreModelToMusicXml(score);

    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
    expect(xml).toContain('<tied type="start"/>');
    expect(xml).toContain('<tied type="stop"/>');
  });
});
