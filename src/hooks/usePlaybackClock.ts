import { useEffect, useRef } from "react";
import {
  initialTempo,
  loopBounds,
  playbackEndBeat,
  usePracticeStore,
} from "../store/practiceStore";

const HIDDEN_COMMIT_MS = 250;

export function usePlaybackClock(): void {
  const lastFrame = useRef<number | undefined>(undefined);
  const lastCommitFrame = useRef(0);
  const positionRef = useRef(0);
  const isPlaying = usePracticeStore((state) => state.isPlaying);
  const score = usePracticeStore((state) => state.score);
  const setPosition = usePracticeStore((state) => state.setPosition);
  const setPlaying = usePracticeStore((state) => state.setPlaying);

  useEffect(() => {
    if (!isPlaying || !score) {
      lastFrame.current = undefined;
      lastCommitFrame.current = 0;
      positionRef.current = usePracticeStore.getState().positionBeats;
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

      const tempo = initialTempo(currentScore);
      const bounds = loopBounds(currentScore, state.settings);
      const beatRate = (tempo / 60) * state.settings.speed;
      const previous = lastFrame.current ?? now;
      lastFrame.current = now;
      const deltaSeconds = (now - previous) / 1000;
      let nextPosition = positionRef.current + deltaSeconds * beatRate;
      let shouldStop = false;
      let shouldCommit = document.hidden ? now - lastCommitFrame.current >= HIDDEN_COMMIT_MS : true;

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
    const frame = () => {
      tick();
      frameId = window.requestAnimationFrame(frame);
    };
    frameId = window.requestAnimationFrame(frame);
    const hiddenIntervalId = window.setInterval(() => {
      if (document.hidden) {
        tick();
      }
    }, HIDDEN_COMMIT_MS);
    window.addEventListener("visibilitychange", tick);

    return () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
      window.clearInterval(hiddenIntervalId);
      window.removeEventListener("visibilitychange", tick);
    };
  }, [isPlaying, score, setPlaying, setPosition]);
}
