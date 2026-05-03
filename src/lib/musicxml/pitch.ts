const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const PIANO_MIN_MIDI = 21;
export const PIANO_MAX_MIDI = 108;

export function pitchToMidi(step: string, alter: number, octave: number): number {
  const semitone = STEP_TO_SEMITONE[step.toUpperCase()];
  if (semitone === undefined) {
    throw new Error(`Unsupported pitch step: ${step}`);
  }

  return (octave + 1) * 12 + semitone + alter;
}

export function midiToPitchName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = SHARP_NAMES[((midi % 12) + 12) % 12];

  return `${name}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}
