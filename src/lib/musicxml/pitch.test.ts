import { describe, expect, it } from "vitest";
import { isBlackKey, midiToPitchName, pitchToMidi, PIANO_MAX_MIDI, PIANO_MIN_MIDI } from "./pitch";

describe("pitchToMidi", () => {
  it("converts C4 (middle C) to MIDI 60", () => {
    expect(pitchToMidi("C", 0, 4)).toBe(60);
  });

  it("converts A4 (concert pitch) to MIDI 69", () => {
    expect(pitchToMidi("A", 0, 4)).toBe(69);
  });

  it("handles sharps with alter +1", () => {
    expect(pitchToMidi("F", 1, 4)).toBe(66); // F#4
    expect(pitchToMidi("C", 1, 4)).toBe(61); // C#4
  });

  it("handles flats with alter -1", () => {
    expect(pitchToMidi("B", -1, 4)).toBe(70); // Bb4
    expect(pitchToMidi("E", -1, 4)).toBe(63); // Eb4
  });

  it("handles double sharps and flats", () => {
    expect(pitchToMidi("C", 2, 4)).toBe(62); // C##4 = D4
    expect(pitchToMidi("D", -2, 4)).toBe(60); // Dbb4 = C4
  });

  it("handles extreme octaves", () => {
    expect(pitchToMidi("A", 0, 0)).toBe(21); // Piano lowest A
    expect(pitchToMidi("C", 0, 8)).toBe(108); // Piano highest C
  });

  it("handles lowercase step names", () => {
    expect(pitchToMidi("c", 0, 4)).toBe(60);
    expect(pitchToMidi("a", 0, 4)).toBe(69);
  });

  it("throws for invalid step names", () => {
    expect(() => pitchToMidi("H", 0, 4)).toThrow("Unsupported pitch step");
    expect(() => pitchToMidi("X", 0, 4)).toThrow("Unsupported pitch step");
  });
});

describe("midiToPitchName", () => {
  it("converts MIDI 60 to C4", () => {
    expect(midiToPitchName(60)).toBe("C4");
  });

  it("converts MIDI 69 to A4", () => {
    expect(midiToPitchName(69)).toBe("A4");
  });

  it("uses sharp notation for black keys", () => {
    expect(midiToPitchName(61)).toBe("C#4");
    expect(midiToPitchName(66)).toBe("F#4");
    expect(midiToPitchName(70)).toBe("A#4");
  });

  it("handles piano range boundaries", () => {
    expect(midiToPitchName(PIANO_MIN_MIDI)).toBe("A0");
    expect(midiToPitchName(PIANO_MAX_MIDI)).toBe("C8");
  });

  it("handles values outside standard range", () => {
    expect(midiToPitchName(0)).toBe("C-1");
    expect(midiToPitchName(127)).toBe("G9");
  });
});

describe("isBlackKey", () => {
  it("returns false for white keys", () => {
    expect(isBlackKey(60)).toBe(false); // C
    expect(isBlackKey(62)).toBe(false); // D
    expect(isBlackKey(64)).toBe(false); // E
    expect(isBlackKey(65)).toBe(false); // F
    expect(isBlackKey(67)).toBe(false); // G
    expect(isBlackKey(69)).toBe(false); // A
    expect(isBlackKey(71)).toBe(false); // B
  });

  it("returns true for black keys", () => {
    expect(isBlackKey(61)).toBe(true); // C#
    expect(isBlackKey(63)).toBe(true); // D#
    expect(isBlackKey(66)).toBe(true); // F#
    expect(isBlackKey(68)).toBe(true); // G#
    expect(isBlackKey(70)).toBe(true); // A#
  });

  it("works across octaves", () => {
    expect(isBlackKey(37)).toBe(true); // C#2
    expect(isBlackKey(49)).toBe(true); // C#3
    expect(isBlackKey(73)).toBe(true); // C#5
  });
});

describe("piano range constants", () => {
  it("defines correct piano range", () => {
    expect(PIANO_MIN_MIDI).toBe(21); // A0
    expect(PIANO_MAX_MIDI).toBe(108); // C8
    expect(PIANO_MAX_MIDI - PIANO_MIN_MIDI + 1).toBe(88); // 88 keys
  });
});
