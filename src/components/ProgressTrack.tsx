import { memo, useCallback, useEffect, useRef, type PointerEvent, type KeyboardEvent } from "react";
import { minimumPositionBeats, playbackEndBeat, usePracticeStore } from "../store/practiceStore";

type PracticeSnapshot = ReturnType<typeof usePracticeStore.getState>;

function playbackRange(state: PracticeSnapshot): { start: number; end: number } {
  return {
    start: minimumPositionBeats(state.score),
    end: playbackEndBeat(state.score, state.playbackEvents),
  };
}

function playbackProgress(state: PracticeSnapshot): number {
  const { end, start } = playbackRange(state);
  const denominator = end - start;
  if (denominator <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, (state.positionBeats - start) / denominator));
}

export const ProgressTrack = memo(function ProgressTrack() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<number | undefined>(undefined);

  const seekToClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const box = track.getBoundingClientRect();
    if (box.width <= 0) {
      return;
    }

    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    const state = usePracticeStore.getState();
    const { end, start } = playbackRange(state);
    state.setPosition(start + ratio * (end - start));
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !usePracticeStore.getState().score) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      seekToClientX(event.clientX);
    },
    [seekToClientX],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }

      seekToClientX(event.clientX);
    },
    [seekToClientX],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  // Arrow keys keep their global meaning (previous/next measure) but must not
  // run twice when the track itself has focus.
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const state = usePracticeStore.getState();
    if (!state.score) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      state.seekByMeasures(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      const { end, start } = playbackRange(state);
      state.setPosition(event.key === "Home" ? start : end);
    }
  }, []);

  useEffect(() => {
    const update = (state: PracticeSnapshot) => {
      const nextProgress = playbackProgress(state);
      if (nextProgress === progressRef.current || !fillRef.current) {
        return;
      }

      progressRef.current = nextProgress;
      fillRef.current.style.transform = `scaleX(${nextProgress})`;
      trackRef.current?.setAttribute("aria-valuenow", `${Math.round(nextProgress * 100)}`);
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
    <div
      aria-label="Playback position"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={0}
      className="progress-track"
      onKeyDown={onKeyDown}
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      ref={trackRef}
      role="slider"
      tabIndex={0}
    >
      <div ref={fillRef} />
    </div>
  );
});
