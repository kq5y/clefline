import { useEffect, useRef } from "react";
import {
  ensurePianoEngine,
  releaseAllPianoKeys,
  scheduleMetronomeClick,
  scheduleMidi,
} from "../lib/audio/pianoEngine";
import { initialTempo, loopBounds, usePracticeStore } from "../store/practiceStore";

const SCHEDULE_INTERVAL_MS = 25;
const LOOK_AHEAD_SECONDS = 0.2;
const HIDDEN_LOOK_AHEAD_SECONDS = 2.2;

function firstEventIndexAtOrAfter(events: { absoluteBeat: number }[], beat: number): number {
  let low = 0;
  let high = events.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle].absoluteBeat < beat) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function isMeasureStartBeat(beat: number): boolean {
  const { score } = usePracticeStore.getState();
  const measure = score?.measures.findLast((item) => item.startBeat <= beat);

  return measure ? Math.abs(beat - measure.startBeat) < 0.001 : Math.abs(beat) < 0.001;
}

export function useTonePlayback(): void {
  const scheduledRef = useRef<Set<string>>(new Set());
  const eventCursorRef = useRef(0);
  const playbackEventsRef = useRef(usePracticeStore.getState().playbackEvents);
  const previousPositionRef = useRef(0);
  const schedulingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const isPlaying = usePracticeStore((state) => state.isPlaying);

  useEffect(() => {
    if (!isPlaying) {
      scheduledRef.current.clear();
      eventCursorRef.current = 0;
      previousPositionRef.current = usePracticeStore.getState().positionBeats;
      schedulingRef.current = false;
      if (wasPlayingRef.current) {
        void releaseAllPianoKeys();
      }
      wasPlayingRef.current = false;
      return undefined;
    }

    wasPlayingRef.current = true;
    let cancelled = false;
    const schedule = async () => {
      if (schedulingRef.current) {
        return;
      }

      schedulingRef.current = true;
      const state = usePracticeStore.getState();
      const score = state.score;
      if (!score || !state.isPlaying) {
        schedulingRef.current = false;
        return;
      }

      try {
        if (playbackEventsRef.current !== state.playbackEvents) {
          playbackEventsRef.current = state.playbackEvents;
          eventCursorRef.current = firstEventIndexAtOrAfter(
            state.playbackEvents,
            state.positionBeats - 0.001,
          );
          scheduledRef.current.clear();
        }

        if (Math.abs(state.positionBeats - previousPositionRef.current) > 0.35) {
          eventCursorRef.current = firstEventIndexAtOrAfter(
            state.playbackEvents,
            state.positionBeats - 0.001,
          );
          scheduledRef.current.clear();
        }
        previousPositionRef.current = state.positionBeats;

        const backend = await ensurePianoEngine();
        if (cancelled) return;

        const beatRate = (initialTempo(score) / 60) * state.settings.speed;
        const beatSeconds = 1 / beatRate;
        const startBeat = state.positionBeats;
        const lookAheadSeconds = document.hidden ? HIDDEN_LOOK_AHEAD_SECONDS : LOOK_AHEAD_SECONDS;
        const bounds = loopBounds(score, state.settings);
        const endBeat = Math.min(
          bounds?.endBeat ?? score.totalBeats,
          startBeat + lookAheadSeconds * beatRate,
        );

        if (state.settings.metronomeEnabled) {
          const firstBeat = Math.ceil(startBeat - 0.0001);
          for (let beat = firstBeat; beat < endBeat; beat += 1) {
            const id = `metronome-${beat.toFixed(3)}`;
            if (scheduledRef.current.has(id)) {
              continue;
            }
            scheduledRef.current.add(id);
            const startTime = backend.Tone.now() + (beat - startBeat) * beatSeconds;
            const accented = isMeasureStartBeat(beat);
            void scheduleMetronomeClick(
              startTime,
              accented,
              state.settings.volume * (accented ? 0.62 : 0.42),
            );
          }
        }

        const events = state.playbackEvents;
        while (
          eventCursorRef.current < events.length &&
          events[eventCursorRef.current].absoluteBeat < startBeat - 0.001
        ) {
          eventCursorRef.current += 1;
        }

        for (let index = eventCursorRef.current; index < events.length; index += 1) {
          const event = events[index];
          if (event.absoluteBeat >= endBeat) {
            break;
          }
          if (scheduledRef.current.has(event.id)) {
            eventCursorRef.current = index + 1;
            continue;
          }
          scheduledRef.current.add(event.id);
          eventCursorRef.current = index + 1;
          const startTime = backend.Tone.now() + (event.absoluteBeat - startBeat) * beatSeconds;
          const duration = Math.max(0.05, event.durationBeats * beatSeconds * 0.92);
          const velocity = Math.min(1, Math.max(0.05, event.velocity));

          for (const [noteIndex, note] of event.notes.entries()) {
            void scheduleMidi(
              note.midi,
              startTime + noteIndex * event.rollOffsetBeats * beatSeconds,
              duration,
              velocity,
              state.settings.volume,
            );
          }
        }
      } finally {
        schedulingRef.current = false;
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
