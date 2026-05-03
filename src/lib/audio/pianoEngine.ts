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

type AudioBackend = {
  Tone: typeof import("tone");
  instrument: SamplerInstrument;
};

let backendPromise: Promise<AudioBackend> | undefined;

function volumeToDb(volume: number): number {
  return volume <= 0 ? -60 : 20 * Math.log10(volume);
}

function samplerUrls(): Record<string, string> {
  return Object.fromEntries(
    SAMPLED_MIDI.map((midi) => {
      const name = midiToPitchName(midi).replace("#", "s");

      return [midiToPitchName(midi), `${name}v8.mp3`];
    }),
  );
}

export async function ensurePianoEngine(): Promise<AudioBackend> {
  backendPromise ??= (async () => {
    const Tone = await import("tone");
    await Tone.start();

    const instrument = new Tone.Sampler({
      urls: samplerUrls(),
      baseUrl: SAMPLE_BASE_URL,
      attack: 0,
      release: 0.8,
      volume: -4,
    }).toDestination() as SamplerInstrument;

    await Tone.loaded();

    return { Tone, instrument };
  })();

  return backendPromise;
}

export async function playMidiOnce(midi: number, velocity: number, seconds = 0.7): Promise<void> {
  const backend = await ensurePianoEngine();
  backend.instrument.volume.value = volumeToDb(velocity);
  backend.instrument.triggerAttackRelease(
    backend.Tone.Frequency(midi, "midi").toNote(),
    seconds,
    undefined,
    velocity,
  );
}

export async function scheduleMidi(
  midi: number,
  startTime: number,
  durationSeconds: number,
  velocity: number,
): Promise<void> {
  const backend = await ensurePianoEngine();
  backend.instrument.volume.value = volumeToDb(velocity);
  backend.instrument.triggerAttackRelease(
    backend.Tone.Frequency(midi, "midi").toNote(),
    Math.max(0.05, durationSeconds),
    startTime,
    velocity,
  );
}

export async function releaseAllPianoKeys(): Promise<void> {
  const backend = await ensurePianoEngine();
  backend.instrument.releaseAll(backend.Tone.now());
}
