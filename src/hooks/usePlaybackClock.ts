import { useEffect, useRef } from "react";
import {
  loopBounds,
  playbackEndBeat,
  tempoAtPlaybackBeat,
  usePracticeStore,
} from "../store/practiceStore";

const HIDDEN_COMMIT_MS = 300;
const VISIBLE_COMMIT_MS = 66;
const HIDDEN_TICK_INTERVAL_MS = 200;

export function usePlaybackClock(): void {
  const lastFrame = useRef<number | undefined>(undefined);
  const lastCommitFrame = useRef(0);
  const positionRef = useRef(0);
  const wasHiddenRef = useRef(false);
  const isPlaying = usePracticeStore((state) => state.isPlaying);
  const score = usePracticeStore((state) => state.score);
  const setPosition = usePracticeStore((state) => state.setPosition);
  const setPlaying = usePracticeStore((state) => state.setPlaying);

  useEffect(() => {
    if (!isPlaying || !score) {
      lastFrame.current = undefined;
      lastCommitFrame.current = 0;
      positionRef.current = usePracticeStore.getState().positionBeats;
      wasHiddenRef.current = false;
      return undefined;
    }

    positionRef.current = usePracticeStore.getState().positionBeats;
    const tick = () => {
      const now = window.performance.now();
      const state = usePracticeStore.getState();
      const currentScore = state.score;
      if (!currentScore) {
        setPlaying(false);
        return;
      }

      const tempo = tempoAtPlaybackBeat(currentScore, state.playbackEvents, positionRef.current);
      const bounds = loopBounds(currentScore, state.settings);
      const beatRate = (tempo / 60) * state.settings.speed;
      const previous = lastFrame.current ?? now;
      lastFrame.current = now;
      const deltaSeconds = (now - previous) / 1000;
      let nextPosition = positionRef.current + deltaSeconds * beatRate;
      let shouldStop = false;
      const commitInterval = document.hidden ? HIDDEN_COMMIT_MS : VISIBLE_COMMIT_MS;
      let shouldCommit = now - lastCommitFrame.current >= commitInterval;

      if (bounds && nextPosition >= bounds.endBeat) {
        nextPosition = bounds.startBeat;
        shouldCommit = true;
      } else {
        const endBeat = playbackEndBeat(currentScore, state.playbackEvents);
        if (nextPosition >= endBeat) {
          nextPosition = endBeat;
          shouldStop = true;
          shouldCommit = true;
        }
      }

      positionRef.current = nextPosition;
      if (shouldCommit) {
        lastCommitFrame.current = now;
        setPosition(nextPosition);
      }

      if (shouldStop) {
        setPlaying(false);
      }
    };

    let frameId: number | undefined;
    let hiddenIntervalId: number | undefined;

    const startAnimationLoop = () => {
      if (frameId !== undefined) return;
      const frame = () => {
        tick();
        frameId = window.requestAnimationFrame(frame);
      };
      frameId = window.requestAnimationFrame(frame);
    };

    const stopAnimationLoop = () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
        frameId = undefined;
      }
    };

    const startHiddenInterval = () => {
      if (hiddenIntervalId !== undefined) return;
      hiddenIntervalId = window.setInterval(tick, HIDDEN_TICK_INTERVAL_MS);
    };

    const stopHiddenInterval = () => {
      if (hiddenIntervalId !== undefined) {
        window.clearInterval(hiddenIntervalId);
        hiddenIntervalId = undefined;
      }
    };

    const handleVisibilityChange = () => {
      tick();
      if (document.hidden) {
        stopAnimationLoop();
        startHiddenInterval();
        wasHiddenRef.current = true;
      } else {
        stopHiddenInterval();
        startAnimationLoop();
        wasHiddenRef.current = false;
      }
    };

    if (document.hidden) {
      startHiddenInterval();
      wasHiddenRef.current = true;
    } else {
      startAnimationLoop();
    }

    window.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopAnimationLoop();
      stopHiddenInterval();
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPlaying, score, setPlaying, setPosition]);
}
