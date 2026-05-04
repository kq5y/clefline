import { describe, expect, it } from "vitest";
import {
  BLACK_KEY_LAYOUTS,
  pianoKeyLayoutForMidi,
  PIANO_KEY_LAYOUTS,
  WHITE_KEY_LAYOUTS,
} from "./pianoLayout";

describe("PIANO_KEY_LAYOUTS", () => {
  it("contains 88 piano keys", () => {
    expect(PIANO_KEY_LAYOUTS).toHaveLength(88);
  });

  it("starts at A0 (MIDI 21) and ends at C8 (MIDI 108)", () => {
    expect(PIANO_KEY_LAYOUTS[0].midi).toBe(21);
    expect(PIANO_KEY_LAYOUTS[0].name).toBe("A0");
    expect(PIANO_KEY_LAYOUTS[87].midi).toBe(108);
    expect(PIANO_KEY_LAYOUTS[87].name).toBe("C8");
  });

  it("has 52 white keys and 36 black keys", () => {
    expect(WHITE_KEY_LAYOUTS).toHaveLength(52);
    expect(BLACK_KEY_LAYOUTS).toHaveLength(36);
  });

  it("all keys have positive center and width percentages", () => {
    for (const key of PIANO_KEY_LAYOUTS) {
      expect(key.centerPercent).toBeGreaterThan(0);
      expect(key.centerPercent).toBeLessThan(100);
      expect(key.keyWidthPercent).toBeGreaterThan(0);
      expect(key.noteWidthPercent).toBeGreaterThan(0);
    }
  });

  it("white keys span the full width from 0 to 100%", () => {
    const firstWhite = WHITE_KEY_LAYOUTS[0];
    const lastWhite = WHITE_KEY_LAYOUTS[WHITE_KEY_LAYOUTS.length - 1];
    const leftEdge = firstWhite.centerPercent - firstWhite.keyWidthPercent / 2;
    const rightEdge = lastWhite.centerPercent + lastWhite.keyWidthPercent / 2;

    expect(leftEdge).toBeCloseTo(0, 5);
    expect(rightEdge).toBeCloseTo(100, 5);
  });

  it("black keys are narrower than white keys", () => {
    const whiteWidth = WHITE_KEY_LAYOUTS[0].keyWidthPercent;
    const blackWidth = BLACK_KEY_LAYOUTS[0].keyWidthPercent;

    expect(blackWidth).toBeLessThan(whiteWidth);
  });
});

describe("pianoKeyLayoutForMidi", () => {
  it("returns correct layout for middle C (MIDI 60)", () => {
    const layout = pianoKeyLayoutForMidi(60);

    expect(layout.midi).toBe(60);
    expect(layout.name).toBe("C4");
    expect(layout.black).toBe(false);
  });

  it("returns correct layout for C#4 (MIDI 61)", () => {
    const layout = pianoKeyLayoutForMidi(61);

    expect(layout.midi).toBe(61);
    expect(layout.name).toBe("C#4");
    expect(layout.black).toBe(true);
  });

  it("returns first key for MIDI below piano range", () => {
    const layout = pianoKeyLayoutForMidi(20);

    expect(layout.midi).toBe(21);
    expect(layout.name).toBe("A0");
  });

  it("returns last key for MIDI above piano range", () => {
    const layout = pianoKeyLayoutForMidi(120);

    expect(layout.midi).toBe(108);
    expect(layout.name).toBe("C8");
  });

  it("black keys are positioned between white keys", () => {
    const c4 = pianoKeyLayoutForMidi(60);
    const cSharp4 = pianoKeyLayoutForMidi(61);
    const d4 = pianoKeyLayoutForMidi(62);

    expect(cSharp4.centerPercent).toBeGreaterThan(c4.centerPercent);
    expect(cSharp4.centerPercent).toBeLessThan(d4.centerPercent);
  });

  it("consecutive white keys have consistent spacing", () => {
    const c4 = pianoKeyLayoutForMidi(60);
    const d4 = pianoKeyLayoutForMidi(62);
    const e4 = pianoKeyLayoutForMidi(64);

    const cdSpacing = d4.centerPercent - c4.centerPercent;
    const deSpacing = e4.centerPercent - d4.centerPercent;

    expect(cdSpacing).toBeCloseTo(deSpacing, 5);
  });
});
