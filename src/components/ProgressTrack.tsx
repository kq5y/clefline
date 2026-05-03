import { memo, useEffect, useRef } from "react";
import { minimumPositionBeats, playbackEndBeat, usePracticeStore } from "../store/practiceStore";

type PracticeSnapshot = ReturnType<typeof usePracticeStore.getState>;

function playbackProgress(state: PracticeSnapshot): number {
  const minimumPosition = minimumPositionBeats(state.score);
  const playbackTotal = playbackEndBeat(state.score, state.playbackEvents);
  const denominator = playbackTotal - minimumPosition;
  if (denominator <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, (state.positionBeats - minimumPosition) / denominator));
}

export const ProgressTrack = memo(function ProgressTrack() {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const update = (state: PracticeSnapshot) => {
      const nextProgress = playbackProgress(state);
      if (nextProgress === progressRef.current || !fillRef.current) {
        return;
      }

      progressRef.current = nextProgress;
      fillRef.current.style.transform = `scaleX(${nextProgress})`;
    };

    update(usePracticeStore.getState());

    return usePracticeStore.subscribe((nextState, previousState) => {
      if (
        nextState.positionBeats !== previousState.positionBeats ||
        nextState.score !== previousState.score ||
        nextState.playbackEvents !== previousState.playbackEvents
      ) {
        update(nextState);
      }
    });
  }, []);

  return (
    <div className="progress-track">
      <div ref={fillRef} />
    </div>
  );
});
