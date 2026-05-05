export type ParsedMidiFile = {
  name: string;
  tracks: ParsedMidiTrack[];
  tempoChanges: MidiTempoChange[];
  timeSignatures: MidiTimeSignature[];
  durationSeconds: number;
  durationTicks: number;
  ppq: number;
};

export type ParsedMidiTrack = {
  name: string;
  notes: MidiNote[];
  controlChanges: MidiControlChange[];
  instrument?: string;
};

export type MidiNote = {
  midi: number;
  ticks: number;
  durationTicks: number;
  velocity: number;
  time: number;
  duration: number;
};

export type MidiTempoChange = {
  ticks: number;
  bpm: number;
  time: number;
};

export type MidiTimeSignature = {
  ticks: number;
  beats: number;
  beatType: number;
  time: number;
};

export type MidiControlChange = {
  ticks: number;
  number: number;
  value: number;
  time: number;
};

export type MidiParseOptions = {
  handSplitMidi?: number;
  useTrackHands?: boolean;
};
