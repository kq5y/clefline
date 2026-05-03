import { useEffect, useRef } from "react";
import { initialTempo, usePracticeStore } from "../store/practiceStore";

type ToneSynth = {
  triggerAttackRelease: (
    notes: string | string[],
    duration: number | string,
    time?: number,
    velocity?: number,
  ) => void;
  releaseAll: () => void;
  dispose: () => void;
  volume: { value: number };
};

function volumeToDb(volume: number): number {
  return volume <= 0 ? -60 : 20 * Math.log10(volume);
}

export function useTonePlayback(): void {
  const synthRef = useRef<ToneSynth | undefined>(undefined);
  const previousPositionRef = useRef(0);
  const isPlaying = usePracticeStore((state) => state.isPlaying);
  const score = usePracticeStore((state) => state.score);
  const playbackEvents = usePracticeStore((state) => state.playbackEvents);
  const positionBeats = usePracticeStore((state) => state.positionBeats);
  const settings = usePracticeStore((state) => state.settings);

  useEffect(() => {
    let disposed = false;

    async function ensureSynth(): Promise<ToneSynth> {
      if (synthRef.current) {
        return synthRef.current;
      }

      const Tone = await import("tone");
      await Tone.start();
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle8" },
        envelope: {
          attack: 0.006,
          decay: 0.18,
          sustain: 0.36,
          release: 0.85,
        },
      }).toDestination() as ToneSynth;

      synth.volume.value = volumeToDb(settings.volume);
      if (!disposed) {
        synthRef.current = synth;
      }

      return synth;
    }

    async function playDueEvents() {
      if (!isPlaying || !score) {
        synthRef.current?.releaseAll();
        previousPositionRef.current = positionBeats;
        return;
      }

      const previous = previousPositionRef.current;
      previousPositionRef.current = positionBeats;

      if (positionBeats < previous) {
        synthRef.current?.releaseAll();
        return;
      }

      const dueEvents = playbackEvents.filter(
        (event) => event.absoluteBeat >= previous && event.absoluteBeat < positionBeats,
      );
      if (dueEvents.length === 0) {
        return;
      }

      const Tone = await import("tone");
      const synth = await ensureSynth();
      synth.volume.value = volumeToDb(settings.volume);
      const beatSeconds = 60 / initialTempo(score) / settings.speed;

      for (const event of dueEvents) {
        const duration = Math.max(0.05, event.durationBeats * beatSeconds * 0.92);
        const notes = event.notes.map((note) => note.pitchName);
        if (event.rollOffsetBeats > 0) {
          for (const [index, note] of notes.entries()) {
            synth.triggerAttackRelease(
              note,
              duration,
              Tone.now() + index * event.rollOffsetBeats * beatSeconds,
              settings.volume,
            );
          }
        } else {
          synth.triggerAttackRelease(notes, duration, undefined, settings.volume);
        }
      }
    }

    void playDueEvents();

    return () => {
      disposed = true;
    };
  }, [isPlaying, playbackEvents, positionBeats, score, settings]);

  useEffect(
    () => () => {
      synthRef.current?.dispose();
      synthRef.current = undefined;
    },
    [],
  );
}
