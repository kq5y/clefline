import { useEffect, useRef } from "react";
import { initialTempo, loopBounds, usePracticeStore } from "../store/practiceStore";

const DISPLAY_FRAME_MS = 25;

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
    let frameId = 0;
    const tick = (now: number) => {
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
      let shouldCommit = now - lastCommitFrame.current >= DISPLAY_FRAME_MS;

      if (bounds && nextPosition >= bounds.endBeat) {
        nextPosition = bounds.startBeat;
        shouldCommit = true;
      } else if (nextPosition >= currentScore.totalBeats) {
        nextPosition = currentScore.totalBeats;
        shouldStop = true;
        shouldCommit = true;
      }

      positionRef.current = nextPosition;
      if (shouldCommit) {
        lastCommitFrame.current = now;
        setPosition(nextPosition);
      }

      if (shouldStop) {
        setPlaying(false);
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isPlaying, score, setPlaying, setPosition]);
}
