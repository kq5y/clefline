import { useEffect, useRef } from "react";
import { initialTempo, loopBounds, usePracticeStore } from "../store/practiceStore";

export function usePlaybackClock(): void {
  const lastFrame = useRef<number | undefined>(undefined);
  const isPlaying = usePracticeStore((state) => state.isPlaying);
  const score = usePracticeStore((state) => state.score);
  const setPosition = usePracticeStore((state) => state.setPosition);
  const setPlaying = usePracticeStore((state) => state.setPlaying);

  useEffect(() => {
    if (!isPlaying || !score) {
      lastFrame.current = undefined;
      return undefined;
    }

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
      let nextPosition = state.positionBeats + deltaSeconds * beatRate;

      if (bounds && nextPosition >= bounds.endBeat) {
        nextPosition = bounds.startBeat;
      } else if (nextPosition >= currentScore.totalBeats) {
        nextPosition = currentScore.totalBeats;
        setPlaying(false);
      }

      setPosition(nextPosition);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isPlaying, score, setPlaying, setPosition]);
}
