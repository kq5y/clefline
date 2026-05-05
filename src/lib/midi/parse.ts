import { Midi } from "@tonejs/midi";
import type { ParsedMidiFile, ParsedMidiTrack, MidiParseOptions } from "./types";
import type {
  ScoreModel,
  NoteEvent,
  DirectionEvent,
  PedalEvent,
  MeasureModel,
  Hand,
  ScoreWarning,
} from "../musicxml/types";
import { midiToPitchName } from "../musicxml/pitch";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DEFAULT_HAND_SPLIT_MIDI = 60;
const DEFAULT_BPM = 120;
const DEFAULT_BEATS = 4;
const DEFAULT_BEAT_TYPE = 4;

export function parseMidi(arrayBuffer: ArrayBuffer): ParsedMidiFile {
  const midi = new Midi(arrayBuffer);

  return {
    name: midi.name || "",
    tracks: midi.tracks.map((track) => ({
      name: track.name || "",
      notes: track.notes.map((note) => ({
        midi: note.midi,
        ticks: note.ticks,
        durationTicks: note.durationTicks,
        velocity: note.velocity,
        time: note.time,
        duration: note.duration,
      })),
      controlChanges: extractSustainPedal(track.controlChanges),
      instrument: track.instrument?.name,
    })),
    tempoChanges: midi.header.tempos.map((t) => ({
      ticks: t.ticks,
      bpm: t.bpm,
      time: t.time ?? 0,
    })),
    timeSignatures: midi.header.timeSignatures.map((ts) => ({
      ticks: ts.ticks,
      beats: ts.timeSignature[0],
      beatType: ts.timeSignature[1],
      time: ts.ticks / midi.header.ppq,
    })),
    durationSeconds: midi.duration,
    durationTicks: midi.durationTicks,
    ppq: midi.header.ppq,
  };
}

function extractSustainPedal(
  controlChanges: Record<number, Array<{ ticks: number; value: number; time: number }>>
): Array<{ ticks: number; number: number; value: number; time: number }> {
  const sustain = controlChanges[64] ?? [];
  return sustain.map((cc) => ({
    ticks: cc.ticks,
    number: 64,
    value: cc.value,
    time: cc.time,
  }));
}

function midiToStep(midi: number): string {
  const name = SHARP_NAMES[((midi % 12) + 12) % 12];
  return name.charAt(0);
}

function midiToAlter(midi: number): number {
  const name = SHARP_NAMES[((midi % 12) + 12) % 12];
  return name.includes("#") ? 1 : 0;
}

function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

function determineHand(
  midi: number,
  trackIndex: number,
  trackCount: number,
  options: MidiParseOptions
): Hand {
  const useTrackHands = options.useTrackHands ?? true;
  const splitMidi = options.handSplitMidi ?? DEFAULT_HAND_SPLIT_MIDI;

  if (useTrackHands && trackCount === 2) {
    return trackIndex === 0 ? "right" : "left";
  }

  return midi >= splitMidi ? "right" : "left";
}

export function midiToScoreModel(
  parsedMidi: ParsedMidiFile,
  fileName: string,
  options: MidiParseOptions = {}
): ScoreModel {
  const { ppq } = parsedMidi;
  const warnings: ScoreWarning[] = [];

  const tracksWithNotes = parsedMidi.tracks.filter((t) => t.notes.length > 0);

  if (tracksWithNotes.length > 2) {
    warnings.push({
      code: "MULTI_TRACK",
      message: `MIDI contains ${tracksWithNotes.length} tracks with notes. Using pitch-based hand assignment.`,
    });
  }

  if (tracksWithNotes.length === 0) {
    warnings.push({
      code: "NO_NOTES",
      message: "MIDI file contains no notes.",
    });
  }

  const measures = buildMeasures(parsedMidi);
  const notes = buildNotes(tracksWithNotes, measures, ppq, options);
  const directions = buildDirections(parsedMidi, measures, ppq);
  const pedals = buildPedals(tracksWithNotes, measures, ppq);

  const totalBeats =
    measures.length > 0
      ? measures[measures.length - 1].startBeat + measures[measures.length - 1].durationBeats
      : 0;

  return {
    metadata: {
      title: fileName.replace(/\.(mid|midi)$/i, ""),
      partName: parsedMidi.name || undefined,
    },
    measures,
    notes,
    directions,
    pedals,
    warnings,
    totalBeats,
    rawXml: "",
  };
}

function buildMeasures(parsedMidi: ParsedMidiFile): MeasureModel[] {
  const { ppq, durationTicks, timeSignatures } = parsedMidi;
  const measures: MeasureModel[] = [];

  const defaultTimeSignature = { beats: DEFAULT_BEATS, beatType: DEFAULT_BEAT_TYPE };
  const timeSigEvents =
    timeSignatures.length > 0
      ? timeSignatures
      : [{ ticks: 0, beats: DEFAULT_BEATS, beatType: DEFAULT_BEAT_TYPE, time: 0 }];

  let currentTick = 0;
  let measureIndex = 0;
  let timeSigIndex = 0;

  while (currentTick < durationTicks) {
    while (
      timeSigIndex < timeSigEvents.length - 1 &&
      timeSigEvents[timeSigIndex + 1].ticks <= currentTick
    ) {
      timeSigIndex += 1;
    }

    const currentTimeSig = timeSigEvents[timeSigIndex] ?? defaultTimeSignature;
    const beatsPerMeasure = currentTimeSig.beats;
    const beatType = currentTimeSig.beatType;
    const ticksPerMeasure = (ppq * 4 * beatsPerMeasure) / beatType;

    const startBeat = currentTick / ppq;
    const durationBeats = beatsPerMeasure * (4 / beatType);

    measures.push({
      index: measureIndex,
      number: String(measureIndex + 1),
      startBeat,
      durationBeats,
      timeSignature: { beats: beatsPerMeasure, beatType },
      repeatStart: false,
      repeatEnd: false,
      endings: [],
    });

    currentTick += ticksPerMeasure;
    measureIndex += 1;
  }

  if (measures.length === 0) {
    measures.push({
      index: 0,
      number: "1",
      startBeat: 0,
      durationBeats: 4,
      timeSignature: defaultTimeSignature,
      repeatStart: false,
      repeatEnd: false,
      endings: [],
    });
  }

  return measures;
}

function findMeasureForBeat(measures: MeasureModel[], beat: number): MeasureModel {
  for (let i = measures.length - 1; i >= 0; i -= 1) {
    if (measures[i].startBeat <= beat) {
      return measures[i];
    }
  }
  return measures[0];
}

function buildNotes(
  tracks: ParsedMidiTrack[],
  measures: MeasureModel[],
  ppq: number,
  options: MidiParseOptions
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  let noteIndex = 0;

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const track = tracks[trackIndex];

    for (const midiNote of track.notes) {
      const startBeat = midiNote.ticks / ppq;
      const durationBeats = midiNote.durationTicks / ppq;
      const measure = findMeasureForBeat(measures, startBeat);
      const hand = determineHand(midiNote.midi, trackIndex, tracks.length, options);

      notes.push({
        id: `midi-note-${noteIndex}`,
        midi: midiNote.midi,
        pitchName: midiToPitchName(midiNote.midi),
        step: midiToStep(midiNote.midi),
        alter: midiToAlter(midiNote.midi),
        octave: midiToOctave(midiNote.midi),
        staff: hand === "right" ? 1 : 2,
        hand,
        voice: "1",
        startBeat,
        durationBeats,
        measureIndex: measure.index,
        measureNumber: measure.number,
        isGrace: false,
        isChordTone: false,
        tieStart: false,
        tieStop: false,
        notations: [],
      });

      noteIndex += 1;
    }
  }

  notes.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);

  return notes;
}

function buildDirections(
  parsedMidi: ParsedMidiFile,
  measures: MeasureModel[],
  ppq: number
): DirectionEvent[] {
  const directions: DirectionEvent[] = [];

  for (let i = 0; i < parsedMidi.tempoChanges.length; i += 1) {
    const tempo = parsedMidi.tempoChanges[i];
    const beat = tempo.ticks / ppq;
    const measure = findMeasureForBeat(measures, beat);

    directions.push({
      id: `midi-tempo-${i}`,
      kind: "tempo",
      beat,
      measureIndex: measure.index,
      measureNumber: measure.number,
      value: Math.round(tempo.bpm),
    });
  }

  if (directions.length === 0) {
    directions.push({
      id: "midi-tempo-default",
      kind: "tempo",
      beat: 0,
      measureIndex: 0,
      measureNumber: "1",
      value: DEFAULT_BPM,
    });
  }

  return directions;
}

function buildPedals(
  tracks: ParsedMidiTrack[],
  measures: MeasureModel[],
  ppq: number
): PedalEvent[] {
  const pedals: PedalEvent[] = [];
  let pedalIndex = 0;

  for (const track of tracks) {
    for (const cc of track.controlChanges) {
      if (cc.number !== 64) continue;

      const beat = cc.ticks / ppq;
      const measure = findMeasureForBeat(measures, beat);
      const type = cc.value >= 0.5 ? "start" : "stop";

      pedals.push({
        id: `midi-pedal-${pedalIndex}`,
        type,
        beat,
        measureIndex: measure.index,
        measureNumber: measure.number,
      });

      pedalIndex += 1;
    }
  }

  pedals.sort((a, b) => a.beat - b.beat);

  return pedals;
}
