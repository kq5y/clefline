import { describe, expect, it } from "vitest";
import { buildGlissandoSegments } from "./glissando";
import type { NoteEvent } from "./types";

function createNote(overrides: Partial<NoteEvent>): NoteEvent {
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

describe("buildGlissandoSegments", () => {
  it("returns empty array when no glissandos", () => {
    const notes = [
      createNote({ id: "n1", midi: 60 }),
      createNote({ id: "n2", midi: 62, startBeat: 1 }),
    ];

    expect(buildGlissandoSegments(notes)).toEqual([]);
  });

  it("builds a segment from start to stop glissando", () => {
    const notes = [
      createNote({
        id: "n1",
        midi: 60,
        startBeat: 0,
        notations: [{ type: "glissando", value: "start", number: "1" }],
      }),
      createNote({
        id: "n2",
        midi: 72,
        startBeat: 2,
        notations: [{ type: "glissando", value: "stop", number: "1" }],
      }),
    ];

    const segments = buildGlissandoSegments(notes);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      id: "n1-n2",
      hand: "right",
      startBeat: 0,
      endBeat: 2,
      startMidi: 60,
      endMidi: 72,
    });
  });

  it("handles slide notation the same as glissando", () => {
    const notes = [
      createNote({
        id: "n1",
        midi: 60,
        startBeat: 0,
        notations: [{ type: "slide", value: "start", number: "1" }],
      }),
      createNote({
        id: "n2",
        midi: 72,
        startBeat: 2,
        notations: [{ type: "slide", value: "stop", number: "1" }],
      }),
    ];

    const segments = buildGlissandoSegments(notes);

    expect(segments).toHaveLength(1);
    expect(segments[0].startMidi).toBe(60);
    expect(segments[0].endMidi).toBe(72);
  });

  it("matches glissandos by number attribute", () => {
    const notes = [
      createNote({
        id: "n1",
        midi: 60,
        startBeat: 0,
        notations: [{ type: "glissando", value: "start", number: "1" }],
      }),
      createNote({
        id: "n2",
        midi: 48,
        startBeat: 0,
        notations: [{ type: "glissando", value: "start", number: "2" }],
      }),
      createNote({
        id: "n3",
        midi: 72,
        startBeat: 2,
        notations: [{ type: "glissando", value: "stop", number: "1" }],
      }),
      createNote({
        id: "n4",
        midi: 36,
        startBeat: 2,
        notations: [{ type: "glissando", value: "stop", number: "2" }],
      }),
    ];

    const segments = buildGlissandoSegments(notes);

    expect(segments).toHaveLength(2);
    expect(segments.find((s) => s.startMidi === 60)?.endMidi).toBe(72);
    expect(segments.find((s) => s.startMidi === 48)?.endMidi).toBe(36);
  });

  it("defaults to number 1 when no number specified", () => {
    const notes = [
      createNote({
        id: "n1",
        midi: 60,
        startBeat: 0,
        notations: [{ type: "glissando", value: "start" }],
      }),
      createNote({
        id: "n2",
        midi: 72,
        startBeat: 2,
        notations: [{ type: "glissando", value: "stop" }],
      }),
    ];

    const segments = buildGlissandoSegments(notes);

    expect(segments).toHaveLength(1);
  });

  it("sets hand to unknown when start and stop have different hands", () => {
    const notes = [
      createNote({
        id: "n1",
        midi: 60,
        hand: "right",
        startBeat: 0,
        notations: [{ type: "glissando", value: "start", number: "1" }],
      }),
      createNote({
        id: "n2",
        midi: 72,
        hand: "left",
        startBeat: 2,
        notations: [{ type: "glissando", value: "stop", number: "1" }],
      }),
    ];

    const segments = buildGlissandoSegments(notes);

    expect(segments[0].hand).toBe("unknown");
  });

  it("preserves hand when start and stop match", () => {
    const notes = [
      createNote({
        id: "n1",
        midi: 60,
        hand: "left",
        startBeat: 0,
        notations: [{ type: "glissando", value: "start", number: "1" }],
      }),
      createNote({
        id: "n2",
        midi: 48,
        hand: "left",
        startBeat: 2,
        notations: [{ type: "glissando", value: "stop", number: "1" }],
      }),
    ];

    const segments = buildGlissandoSegments(notes);

    expect(segments[0].hand).toBe("left");
  });

  it("ignores unmatched glissando starts", () => {
    const notes = [
      createNote({
        id: "n1",
        midi: 60,
        startBeat: 0,
        notations: [{ type: "glissando", value: "start", number: "1" }],
      }),
      createNote({ id: "n2", midi: 62, startBeat: 1 }),
    ];

    expect(buildGlissandoSegments(notes)).toEqual([]);
  });

  it("ignores unmatched glissando stops", () => {
    const notes = [
      createNote({ id: "n1", midi: 60, startBeat: 0 }),
      createNote({
        id: "n2",
        midi: 72,
        startBeat: 2,
        notations: [{ type: "glissando", value: "stop", number: "1" }],
      }),
    ];

    expect(buildGlissandoSegments(notes)).toEqual([]);
  });

  it("separates segments by staff and voice", () => {
    const notes = [
      createNote({
        id: "n1",
        midi: 60,
        staff: 1,
        voice: "1",
        startBeat: 0,
        notations: [{ type: "glissando", value: "start", number: "1" }],
      }),
      createNote({
        id: "n2",
        midi: 48,
        staff: 2,
        voice: "1",
        startBeat: 0,
        notations: [{ type: "glissando", value: "start", number: "1" }],
      }),
      createNote({
        id: "n3",
        midi: 72,
        staff: 1,
        voice: "1",
        startBeat: 2,
        notations: [{ type: "glissando", value: "stop", number: "1" }],
      }),
      createNote({
        id: "n4",
        midi: 36,
        staff: 2,
        voice: "1",
        startBeat: 2,
        notations: [{ type: "glissando", value: "stop", number: "1" }],
      }),
    ];

    const segments = buildGlissandoSegments(notes);

    expect(segments).toHaveLength(2);
    expect(segments.find((s) => s.startMidi === 60)?.endMidi).toBe(72);
    expect(segments.find((s) => s.startMidi === 48)?.endMidi).toBe(36);
  });
});
