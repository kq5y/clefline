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

const PITCH_NAME_TABLE: string[] = [];
for (let midi = 0; midi <= 127; midi += 1) {
  const octave = Math.floor(midi / 12) - 1;
  const name = SHARP_NAMES[midi % 12];
  PITCH_NAME_TABLE[midi] = `${name}${octave}`;
}

export function pitchToMidi(step: string, alter: number, octave: number): number {
  const semitone = STEP_TO_SEMITONE[step.toUpperCase()];
  if (semitone === undefined) {
    throw new Error(`Unsupported pitch step: ${step}`);
  }

  return (octave + 1) * 12 + semitone + alter;
}

export function midiToPitchName(midi: number): string {
  return PITCH_NAME_TABLE[midi] ?? `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

const BLACK_KEY_SEMITONES = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK_KEY_SEMITONES.has(((midi % 12) + 12) % 12);
}
