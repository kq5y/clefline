export type Hand = "left" | "right" | "unknown";

export type Notation = {
  type: string;
  value?: string;
  number?: string;
  placement?: string;
  text?: string;
};

export type ScoreMetadata = {
  title: string;
  composer?: string;
  software?: string;
  source?: string;
  version?: string;
  partName?: string;
};

export type MeasureModel = {
  index: number;
  number: string;
  startBeat: number;
  durationBeats: number;
  timeSignature: {
    beats: number;
    beatType: number;
  };
  repeatStart: boolean;
  repeatEnd: boolean;
  endings: string[];
  barStyle?: string;
};

export type NoteEvent = {
  id: string;
  midi: number;
  pitchName: string;
  step: string;
  alter: number;
  octave: number;
  staff: number;
  hand: Hand;
  voice: string;
  startBeat: number;
  durationBeats: number;
  measureIndex: number;
  measureNumber: string;
  isGrace: boolean;
  isChordTone: boolean;
  tieStart: boolean;
  tieStop: boolean;
  tieGroupId?: string;
  notations: Notation[];
};

export type DirectionKind =
  | "tempo"
  | "dynamic"
  | "wedge"
  | "words"
  | "rehearsal"
  | "octave-shift"
  | "segno"
  | "coda"
  | "repeat-navigation"
  | "other";

export type DirectionEvent = {
  id: string;
  kind: DirectionKind;
  beat: number;
  measureIndex: number;
  measureNumber: string;
  staff?: number;
  text?: string;
  value?: string | number;
  placement?: string;
};

export type ScoreWarning = {
  code: string;
  message: string;
  measureNumber?: string;
};

export type PedalEvent = {
  id: string;
  type: "start" | "stop" | "change";
  beat: number;
  measureIndex: number;
  measureNumber: string;
};

export type ScoreModel = {
  metadata: ScoreMetadata;
  measures: MeasureModel[];
  notes: NoteEvent[];
  directions: DirectionEvent[];
  pedals: PedalEvent[];
  warnings: ScoreWarning[];
  totalBeats: number;
  rawXml: string;
};

export type PlaybackEvent = {
  id: string;
  absoluteBeat: number;
  sourceStartBeat: number;
  durationBeats: number;
  notationDurationBeats?: number;
  noteEventIds: string[];
  notes: NoteEvent[];
  measureNumber: string;
  staff: number;
  hand: Hand;
  velocity: number;
  rollOffsetBeats: number;
  notationLabels: string[];
};
