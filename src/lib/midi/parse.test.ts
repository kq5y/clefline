import { describe, expect, it } from "vitest";
import { Midi } from "@tonejs/midi";
import { parseMidi, midiToScoreModel } from "./parse";
import type { ParsedMidiFile } from "./types";

function createMidiArrayBuffer(setup: (midi: Midi) => void): ArrayBuffer {
  const midi = new Midi();
  midi.header.setTempo(120);
  setup(midi);
  return midi.toArray().buffer as ArrayBuffer;
}

function createParsedMidi(overrides: Partial<ParsedMidiFile> = {}): ParsedMidiFile {
  return {
    name: "test",
    tracks: [],
    tempoChanges: [{ ticks: 0, bpm: 120, time: 0 }],
    timeSignatures: [{ ticks: 0, beats: 4, beatType: 4, time: 0 }],
    durationSeconds: 4,
    durationTicks: 1920,
    ppq: 480,
    ...overrides,
  };
}

describe("parseMidi", () => {
  it("parses empty MIDI file", () => {
    const buffer = createMidiArrayBuffer(() => {});
    const result = parseMidi(buffer);

    expect(result.ppq).toBe(480);
    expect(result.tracks).toHaveLength(0);
  });

  it("extracts tempo changes", () => {
    const buffer = createMidiArrayBuffer((midi) => {
      midi.header.setTempo(120);
    });
    const result = parseMidi(buffer);

    expect(result.tempoChanges.length).toBeGreaterThanOrEqual(1);
    expect(result.tempoChanges[0].bpm).toBe(120);
  });

  it("extracts notes from track", () => {
    const buffer = createMidiArrayBuffer((midi) => {
      const track = midi.addTrack();
      track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
      track.addNote({ midi: 64, time: 0.5, duration: 0.5, velocity: 0.6 });
    });
    const result = parseMidi(buffer);

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].notes).toHaveLength(2);
    expect(result.tracks[0].notes[0].midi).toBe(60);
    expect(result.tracks[0].notes[1].midi).toBe(64);
  });

  it("extracts sustain pedal CC64", () => {
    const buffer = createMidiArrayBuffer((midi) => {
      const track = midi.addTrack();
      track.addNote({ midi: 60, time: 0, duration: 1 });
      track.addCC({ number: 64, value: 1, time: 0 });
      track.addCC({ number: 64, value: 0, time: 1 });
    });
    const result = parseMidi(buffer);

    expect(result.tracks[0].controlChanges).toHaveLength(2);
    expect(result.tracks[0].controlChanges[0].value).toBeGreaterThan(0.5);
    expect(result.tracks[0].controlChanges[1].value).toBe(0);
  });
});

describe("midiToScoreModel", () => {
  it("creates ScoreModel with metadata", () => {
    const parsed = createParsedMidi({ name: "Test Song" });
    const score = midiToScoreModel(parsed, "test.mid");

    expect(score.metadata.title).toBe("test");
    expect(score.rawXml).toBe("");
  });

  it("generates measures from time signature", () => {
    const parsed = createParsedMidi({
      timeSignatures: [{ ticks: 0, beats: 4, beatType: 4, time: 0 }],
      durationTicks: 1920,
      ppq: 480,
    });
    const score = midiToScoreModel(parsed, "test.mid");

    expect(score.measures.length).toBeGreaterThan(0);
    expect(score.measures[0].timeSignature).toEqual({ beats: 4, beatType: 4 });
  });

  it("converts notes with correct MIDI values", () => {
    const parsed = createParsedMidi({
      tracks: [
        {
          name: "Piano",
          notes: [
            { midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8, time: 0, duration: 0.5 },
            { midi: 64, ticks: 480, durationTicks: 480, velocity: 0.6, time: 0.5, duration: 0.5 },
          ],
          controlChanges: [],
        },
      ],
    });
    const score = midiToScoreModel(parsed, "test.mid");

    expect(score.notes).toHaveLength(2);
    expect(score.notes[0].midi).toBe(60);
    expect(score.notes[0].pitchName).toBe("C4");
    expect(score.notes[0].startBeat).toBe(0);
    expect(score.notes[0].durationBeats).toBe(1);
    expect(score.notes[1].midi).toBe(64);
    expect(score.notes[1].pitchName).toBe("E4");
    expect(score.notes[1].startBeat).toBe(1);
  });

  it("assigns hands based on pitch for single track", () => {
    const parsed = createParsedMidi({
      tracks: [
        {
          name: "Piano",
          notes: [
            { midi: 72, ticks: 0, durationTicks: 480, velocity: 0.8, time: 0, duration: 0.5 },
            { midi: 48, ticks: 0, durationTicks: 480, velocity: 0.6, time: 0, duration: 0.5 },
          ],
          controlChanges: [],
        },
      ],
    });
    const score = midiToScoreModel(parsed, "test.mid");

    const highNote = score.notes.find((n) => n.midi === 72);
    const lowNote = score.notes.find((n) => n.midi === 48);
    expect(highNote?.hand).toBe("right");
    expect(lowNote?.hand).toBe("left");
  });

  it("assigns hands based on track for two tracks", () => {
    const parsed = createParsedMidi({
      tracks: [
        {
          name: "Right Hand",
          notes: [{ midi: 48, ticks: 0, durationTicks: 480, velocity: 0.8, time: 0, duration: 0.5 }],
          controlChanges: [],
        },
        {
          name: "Left Hand",
          notes: [{ midi: 72, ticks: 0, durationTicks: 480, velocity: 0.6, time: 0, duration: 0.5 }],
          controlChanges: [],
        },
      ],
    });
    const score = midiToScoreModel(parsed, "test.mid");

    const track0Note = score.notes.find((n) => n.midi === 48);
    const track1Note = score.notes.find((n) => n.midi === 72);
    expect(track0Note?.hand).toBe("right");
    expect(track1Note?.hand).toBe("left");
  });

  it("adds warning for more than 2 tracks", () => {
    const parsed = createParsedMidi({
      tracks: [
        { name: "Track 1", notes: [{ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8, time: 0, duration: 0.5 }], controlChanges: [] },
        { name: "Track 2", notes: [{ midi: 64, ticks: 0, durationTicks: 480, velocity: 0.8, time: 0, duration: 0.5 }], controlChanges: [] },
        { name: "Track 3", notes: [{ midi: 67, ticks: 0, durationTicks: 480, velocity: 0.8, time: 0, duration: 0.5 }], controlChanges: [] },
      ],
    });
    const score = midiToScoreModel(parsed, "test.mid");

    expect(score.warnings.some((w) => w.code === "MULTI_TRACK")).toBe(true);
  });

  it("adds warning for empty MIDI", () => {
    const parsed = createParsedMidi({ tracks: [] });
    const score = midiToScoreModel(parsed, "test.mid");

    expect(score.warnings.some((w) => w.code === "NO_NOTES")).toBe(true);
  });

  it("converts tempo changes to directions", () => {
    const parsed = createParsedMidi({
      tempoChanges: [
        { ticks: 0, bpm: 120, time: 0 },
        { ticks: 960, bpm: 140, time: 2 },
      ],
      tracks: [
        { name: "Piano", notes: [{ midi: 60, ticks: 0, durationTicks: 1920, velocity: 0.8, time: 0, duration: 4 }], controlChanges: [] },
      ],
    });
    const score = midiToScoreModel(parsed, "test.mid");

    expect(score.directions).toHaveLength(2);
    expect(score.directions[0].kind).toBe("tempo");
    expect(score.directions[0].value).toBe(120);
    expect(score.directions[1].value).toBe(140);
  });

  it("converts sustain pedal to pedal events", () => {
    const parsed = createParsedMidi({
      tracks: [
        {
          name: "Piano",
          notes: [{ midi: 60, ticks: 0, durationTicks: 960, velocity: 0.8, time: 0, duration: 2 }],
          controlChanges: [
            { ticks: 0, number: 64, value: 127, time: 0 },
            { ticks: 480, number: 64, value: 0, time: 1 },
          ],
        },
      ],
    });
    const score = midiToScoreModel(parsed, "test.mid");

    expect(score.pedals).toHaveLength(2);
    expect(score.pedals[0].type).toBe("start");
    expect(score.pedals[1].type).toBe("stop");
  });

  it("calculates totalBeats correctly", () => {
    const parsed = createParsedMidi({
      durationTicks: 1920,
      ppq: 480,
      tracks: [
        { name: "Piano", notes: [{ midi: 60, ticks: 0, durationTicks: 1920, velocity: 0.8, time: 0, duration: 4 }], controlChanges: [] },
      ],
    });
    const score = midiToScoreModel(parsed, "test.mid");

    expect(score.totalBeats).toBeGreaterThan(0);
  });

  it("uses custom hand split MIDI option", () => {
    const parsed = createParsedMidi({
      tracks: [
        {
          name: "Piano",
          notes: [
            { midi: 55, ticks: 0, durationTicks: 480, velocity: 0.8, time: 0, duration: 0.5 },
            { midi: 56, ticks: 0, durationTicks: 480, velocity: 0.6, time: 0, duration: 0.5 },
          ],
          controlChanges: [],
        },
      ],
    });
    const score = midiToScoreModel(parsed, "test.mid", { handSplitMidi: 56 });

    const note55 = score.notes.find((n) => n.midi === 55);
    const note56 = score.notes.find((n) => n.midi === 56);
    expect(note55?.hand).toBe("left");
    expect(note56?.hand).toBe("right");
  });
});
