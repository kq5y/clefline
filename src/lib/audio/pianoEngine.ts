import { midiToPitchName } from "../musicxml";

const SAMPLE_BASE_URL = "https://tambien.github.io/Piano/audio/";
const SAMPLED_MIDI = [
  21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90,
  93, 96, 99, 102, 105, 108,
];

type SamplerInstrument = {
  triggerAttackRelease: (
    notes: string | string[],
    duration: number | string,
    time?: number,
    velocity?: number,
  ) => void;
  releaseAll: (time?: number) => void;
  dispose: () => void;
  volume: { value: number };
};

type ClickInstrument = {
  triggerAttackRelease: (
    note: string,
    duration: number | string,
    time?: number,
    velocity?: number,
  ) => void;
  triggerRelease?: (time?: number) => void;
  volume: { value: number };
};

type AudioBackend = {
  Tone: typeof import("tone");
  instrument: SamplerInstrument;
  metronome: ClickInstrument;
};

export type PianoAudioBackend = AudioBackend;

let backendPromise: Promise<AudioBackend> | undefined;
let lastInstrumentVolume = Number.NaN;
let lastMetronomeVolume = Number.NaN;

function volumeToDb(volume: number): number {
  return volume <= 0 ? -60 : 20 * Math.log10(volume);
}

function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume));
}

function samplerUrls(): Record<string, string> {
  return Object.fromEntries(
    SAMPLED_MIDI.map((midi) => {
      const name = midiToPitchName(midi).replace("#", "s");

      return [midiToPitchName(midi), `${name}v8.mp3`];
    }),
  );
}

async function loadPianoEngine(): Promise<AudioBackend> {
  backendPromise ??= (async () => {
    const Tone = await import("tone");

    const instrument = new Tone.Sampler({
      urls: samplerUrls(),
      baseUrl: SAMPLE_BASE_URL,
      attack: 0,
      release: 0.8,
      volume: -4,
    }).toDestination() as SamplerInstrument;
    const metronome = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 2.8,
      oscillator: { type: "square" },
      envelope: {
        attack: 0.001,
        decay: 0.045,
        sustain: 0,
        release: 0.02,
      },
      volume: -12,
    }).toDestination() as ClickInstrument;

    await Tone.loaded();

    return { Tone, instrument, metronome };
  })();

  return backendPromise;
}

export async function preloadPianoEngine(): Promise<void> {
  await loadPianoEngine();
}

export async function ensurePianoEngine(): Promise<AudioBackend> {
  const backend = await loadPianoEngine();
  await backend.Tone.start();

  return backend;
}

export async function playMidiOnce(midi: number, volume: number, seconds = 0.7): Promise<void> {
  const backend = await ensurePianoEngine();
  scheduleMidiOnBackend(backend, midi, undefined, seconds, 0.86, volume);
}

export function scheduleMidiOnBackend(
  backend: PianoAudioBackend,
  midi: number,
  startTime: number | undefined,
  durationSeconds: number,
  velocity: number,
  masterVolume = 1,
): void {
  const clamped = clampVolume(masterVolume);
  if (clamped !== lastInstrumentVolume) {
    lastInstrumentVolume = clamped;
    backend.instrument.volume.value = volumeToDb(clamped);
  }
  backend.instrument.triggerAttackRelease(
    midiToPitchName(midi),
    Math.max(0.05, durationSeconds),
    startTime,
    clampVolume(velocity),
  );
}

export async function scheduleMidi(
  midi: number,
  startTime: number,
  durationSeconds: number,
  velocity: number,
  masterVolume = 1,
): Promise<void> {
  const backend = await ensurePianoEngine();
  scheduleMidiOnBackend(backend, midi, startTime, durationSeconds, velocity, masterVolume);
}

export function scheduleMetronomeClickOnBackend(
  backend: PianoAudioBackend,
  startTime: number,
  accented: boolean,
  volume: number,
): void {
  const clamped = Math.max(0.01, volume);
  if (clamped !== lastMetronomeVolume) {
    lastMetronomeVolume = clamped;
    backend.metronome.volume.value = volumeToDb(clamped);
  }
  backend.metronome.triggerAttackRelease(
    accented ? "C7" : "C5",
    accented ? 0.055 : 0.038,
    startTime,
    clampVolume(accented ? 0.92 : 0.58),
  );
}

export async function scheduleMetronomeClick(
  startTime: number,
  accented: boolean,
  volume: number,
): Promise<void> {
  const backend = await ensurePianoEngine();
  scheduleMetronomeClickOnBackend(backend, startTime, accented, volume);
}

export async function releaseAllPianoKeys(): Promise<void> {
  const backend = await ensurePianoEngine();
  backend.instrument.releaseAll(backend.Tone.now());
  backend.metronome.triggerRelease?.(backend.Tone.now());
}
