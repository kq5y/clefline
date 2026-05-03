import { useEffect, useRef } from "react";
import { ensurePianoEngine, releaseAllPianoKeys, scheduleMidi } from "../lib/audio/pianoEngine";
import { initialTempo, loopBounds, usePracticeStore } from "../store/practiceStore";

const SCHEDULE_INTERVAL_MS = 25;
const LOOK_AHEAD_SECONDS = 0.16;

export function useTonePlayback(): void {
  const scheduledRef = useRef<Set<string>>(new Set());
  const previousPositionRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const isPlaying = usePracticeStore((state) => state.isPlaying);

  useEffect(() => {
    if (!isPlaying) {
      scheduledRef.current.clear();
      previousPositionRef.current = usePracticeStore.getState().positionBeats;
      if (wasPlayingRef.current) {
        void releaseAllPianoKeys();
      }
      wasPlayingRef.current = false;
      return undefined;
    }

    wasPlayingRef.current = true;
    let cancelled = false;
    const schedule = async () => {
      const state = usePracticeStore.getState();
      const score = state.score;
      if (!score || !state.isPlaying) {
        return;
      }

      if (state.positionBeats < previousPositionRef.current) {
        scheduledRef.current.clear();
      }
      previousPositionRef.current = state.positionBeats;

      const backend = await ensurePianoEngine();
      if (cancelled) return;

      const beatRate = (initialTempo(score) / 60) * state.settings.speed;
      const beatSeconds = 1 / beatRate;
      const startBeat = state.positionBeats;
      const bounds = loopBounds(score, state.settings);
      const endBeat = Math.min(
        bounds?.endBeat ?? score.totalBeats,
        startBeat + LOOK_AHEAD_SECONDS * beatRate,
      );

      for (const event of state.playbackEvents) {
        if (event.absoluteBeat < startBeat || event.absoluteBeat >= endBeat) {
          continue;
        }
        if (scheduledRef.current.has(event.id)) {
          continue;
        }
        scheduledRef.current.add(event.id);
        const startTime = backend.Tone.now() + (event.absoluteBeat - startBeat) * beatSeconds;
        const duration = Math.max(0.05, event.durationBeats * beatSeconds * 0.92);
        const velocity = Math.min(1, Math.max(0.05, event.velocity * state.settings.volume));

        for (const [index, note] of event.notes.entries()) {
          void scheduleMidi(
            note.midi,
            startTime + index * event.rollOffsetBeats * beatSeconds,
            duration,
            velocity,
          );
        }
      }
    };

    void schedule();
    const interval = window.setInterval(() => {
      void schedule();
    }, SCHEDULE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isPlaying]);
}
