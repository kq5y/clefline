import { useEffect, useRef } from "react";
import {
  ensurePianoEngine,
  releaseAllPianoKeys,
  scheduleMetronomeClickOnBackend,
  scheduleMidiOnBackend,
} from "../lib/audio/pianoEngine";
import { buildMetronomeClicks } from "../lib/musicxml";
import {
  loopBounds,
  playbackEndBeat,
  sourceBeatAt,
  tempoAtPlaybackBeat,
  tempoAtSourceBeat,
  type PracticeSettings,
  usePracticeStore,
} from "../store/practiceStore";
import type { PlaybackEvent, ScoreModel } from "../lib/musicxml";

const SCHEDULE_INTERVAL_MS = 25;
const LOOK_AHEAD_SECONDS = 0.36;
const HIDDEN_LOOK_AHEAD_SECONDS = 2.2;
const LATE_EVENT_CATCHUP_SECONDS = 0.6;
const MIN_SCHEDULE_DELAY_SECONDS = 0.004;
const MAX_SCHEDULED_IDS = 500;
const metronomeClickCache = new WeakMap<ScoreModel, ReturnType<typeof buildMetronomeClicks>>();

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

function beatRateForTempo(tempo: number, speed: number): number {
  return Math.max(0.05, (tempo / 60) * speed);
}

function metronomeClicksFor(score: ScoreModel): ReturnType<typeof buildMetronomeClicks> {
  let clicks = metronomeClickCache.get(score);
  if (!clicks) {
    clicks = buildMetronomeClicks(score);
    metronomeClickCache.set(score, clicks);
  }

  return clicks;
}

function secondsBetweenPlaybackBeats(
  score: ScoreModel,
  fromBeat: number,
  toBeat: number,
  speed: number,
): number {
  if (toBeat <= fromBeat) {
    return 0;
  }

  const span = toBeat - fromBeat;
  // For short spans (typical note durations), use single tempo calculation
  if (span <= 1) {
    const sourceBeat = sourceBeatAt(score, fromBeat);
    const tempo = tempoAtSourceBeat(score, sourceBeat);
    return span / beatRateForTempo(tempo, speed);
  }

  // For longer spans, use adaptive step size based on span length
  const stepSize = span > 4 ? 1 : 0.5;
  let seconds = 0;
  let cursor = fromBeat;
  while (cursor < toBeat - 0.0001) {
    const next = Math.min(toBeat, cursor + stepSize);
    const sourceBeat = sourceBeatAt(score, cursor);
    const tempo = tempoAtSourceBeat(score, sourceBeat);
    seconds += (next - cursor) / beatRateForTempo(tempo, speed);
    cursor = next;
  }

  return seconds;
}

function playbackBeatAfterSeconds(
  score: ScoreModel,
  fromBeat: number,
  seconds: number,
  speed: number,
  endLimit: number,
): number {
  let remainingSeconds = seconds;
  let cursor = fromBeat;

  while (remainingSeconds > 0 && cursor < endLimit - 0.0001) {
    const tempo = tempoAtSourceBeat(score, sourceBeatAt(score, cursor));
    const beatRate = beatRateForTempo(tempo, speed);
    const maxStepBeats = Math.min(0.5, endLimit - cursor);
    const maxStepSeconds = maxStepBeats / beatRate;
    if (remainingSeconds <= maxStepSeconds) {
      return cursor + remainingSeconds * beatRate;
    }

    remainingSeconds -= maxStepSeconds;
    cursor += maxStepBeats;
  }

  return Math.min(cursor, endLimit);
}

function playbackBeatBeforeSeconds(
  score: ScoreModel,
  fromBeat: number,
  seconds: number,
  speed: number,
): number {
  let remainingSeconds = seconds;
  let cursor = fromBeat;

  while (remainingSeconds > 0 && cursor > 0.0001) {
    const tempo = tempoAtSourceBeat(score, sourceBeatAt(score, cursor));
    const beatRate = beatRateForTempo(tempo, speed);
    const maxStepBeats = Math.min(0.5, cursor);
    const maxStepSeconds = maxStepBeats / beatRate;
    if (remainingSeconds <= maxStepSeconds) {
      return Math.max(0, cursor - remainingSeconds * beatRate);
    }

    remainingSeconds -= maxStepSeconds;
    cursor -= maxStepBeats;
  }

  return Math.max(0, cursor);
}

export function audioScheduleStartTime(
  now: number,
  score: ScoreModel,
  startBeat: number,
  targetBeat: number,
  settings: PracticeSettings,
): number {
  if (targetBeat <= startBeat) {
    return now + MIN_SCHEDULE_DELAY_SECONDS;
  }

  return now + secondsBetweenPlaybackBeats(score, startBeat, targetBeat, settings.speed);
}

export function audioScheduleEndBeat(
  score: ScoreModel,
  events: PlaybackEvent[],
  settings: PracticeSettings,
): number {
  return loopBounds(score, settings)?.endBeat ?? playbackEndBeat(score, events);
}

export function audioScheduleCatchupStartBeat(
  score: ScoreModel,
  startBeat: number,
  settings: PracticeSettings,
): number {
  return playbackBeatBeforeSeconds(score, startBeat, LATE_EVENT_CATCHUP_SECONDS, settings.speed);
}

export function useTonePlayback(): void {
  const scheduledRef = useRef<Set<string>>(new Set());
  const eventCursorRef = useRef(0);
  const metronomeCursorRef = useRef<number | undefined>(undefined);
  const playbackEventsRef = useRef(usePracticeStore.getState().playbackEvents);
  const previousPositionRef = useRef(0);
  const previousPositionTimeRef = useRef(0);
  const schedulingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const isPlaying = usePracticeStore((state) => state.isPlaying);

  useEffect(() => {
    if (!isPlaying) {
      scheduledRef.current.clear();
      eventCursorRef.current = 0;
      metronomeCursorRef.current = undefined;
      previousPositionRef.current = usePracticeStore.getState().positionBeats;
      previousPositionTimeRef.current = window.performance.now();
      schedulingRef.current = false;
      if (wasPlayingRef.current) {
        void releaseAllPianoKeys();
      }
      wasPlayingRef.current = false;
      return undefined;
    }

    wasPlayingRef.current = true;
    let cancelled = false;
    const backendPromise = ensurePianoEngine();
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
        const scheduleTime = window.performance.now();
        const beatRate = beatRateForTempo(
          tempoAtPlaybackBeat(score, state.positionBeats),
          state.settings.speed,
        );
        if (playbackEventsRef.current !== state.playbackEvents) {
          playbackEventsRef.current = state.playbackEvents;
          eventCursorRef.current = firstEventIndexAtOrAfter(
            state.playbackEvents,
            state.positionBeats - 0.001,
          );
          metronomeCursorRef.current = undefined;
          scheduledRef.current.clear();
          previousPositionRef.current = state.positionBeats;
          previousPositionTimeRef.current = scheduleTime;
        }

        const positionDelta = state.positionBeats - previousPositionRef.current;
        const elapsedSeconds = Math.max(0, (scheduleTime - previousPositionTimeRef.current) / 1000);
        const allowedForwardDelta = beatRate * elapsedSeconds + (document.hidden ? 0.85 : 0.35);
        if (positionDelta < -0.05 || positionDelta > allowedForwardDelta) {
          eventCursorRef.current = firstEventIndexAtOrAfter(
            state.playbackEvents,
            state.positionBeats - 0.001,
          );
          metronomeCursorRef.current = undefined;
          scheduledRef.current.clear();
        }
        if (positionDelta !== 0) {
          previousPositionRef.current = state.positionBeats;
          previousPositionTimeRef.current = scheduleTime;
        }

        const backend = await backendPromise;
        if (cancelled) return;

        const startBeat = state.positionBeats;
        const toneNow = backend.Tone.now();
        const lookAheadSeconds = document.hidden ? HIDDEN_LOOK_AHEAD_SECONDS : LOOK_AHEAD_SECONDS;
        const endLimit = audioScheduleEndBeat(score, state.playbackEvents, state.settings);
        const catchupStartBeat = audioScheduleCatchupStartBeat(score, startBeat, state.settings);
        const endBeat = playbackBeatAfterSeconds(
          score,
          startBeat,
          lookAheadSeconds,
          state.settings.speed,
          endLimit,
        );

        if (state.settings.metronomeEnabled) {
          const clicks = metronomeClicksFor(score);
          // A cursor (rather than an id set) keeps every click scheduled exactly
          // once, even when the id set is pruned mid-playback.
          let clickCursor =
            metronomeCursorRef.current ??
            firstEventIndexAtOrAfter(clicks, catchupStartBeat - 0.001);
          while (
            clickCursor < clicks.length &&
            clicks[clickCursor].absoluteBeat < catchupStartBeat - 0.001
          ) {
            clickCursor += 1;
          }

          for (let index = clickCursor; index < clicks.length; index += 1) {
            const click = clicks[index];
            if (click.absoluteBeat >= endBeat) {
              break;
            }

            clickCursor = index + 1;
            const startTime = audioScheduleStartTime(
              toneNow,
              score,
              startBeat,
              click.absoluteBeat,
              state.settings,
            );
            scheduleMetronomeClickOnBackend(
              backend,
              startTime,
              click.accented,
              state.settings.volume * (click.accented ? 0.68 : 0.44),
            );
          }
          metronomeCursorRef.current = clickCursor;
        } else {
          metronomeCursorRef.current = undefined;
        }

        const events = state.playbackEvents;
        while (
          eventCursorRef.current < events.length &&
          events[eventCursorRef.current].absoluteBeat < catchupStartBeat - 0.001
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
          const startTime = audioScheduleStartTime(
            toneNow,
            score,
            startBeat,
            event.absoluteBeat,
            state.settings,
          );
          const eventSeconds = secondsBetweenPlaybackBeats(
            score,
            event.absoluteBeat,
            event.absoluteBeat + event.durationBeats,
            state.settings.speed,
          );
          const rollOffsetSeconds = secondsBetweenPlaybackBeats(
            score,
            event.absoluteBeat,
            event.absoluteBeat + event.rollOffsetBeats,
            state.settings.speed,
          );
          const duration = Math.max(0.05, eventSeconds * 0.92);
          const velocity = Math.min(1, Math.max(0.05, event.velocity));

          for (const [noteIndex, note] of event.notes.entries()) {
            scheduleMidiOnBackend(
              backend,
              note.midi,
              startTime + noteIndex * rollOffsetSeconds,
              duration,
              velocity,
              state.settings.volume,
            );
          }
        }
      } finally {
        schedulingRef.current = false;
        if (scheduledRef.current.size > MAX_SCHEDULED_IDS) {
          scheduledRef.current.clear();
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
