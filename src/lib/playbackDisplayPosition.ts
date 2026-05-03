import {
  loopBounds,
  playbackEndBeat,
  tempoAtPlaybackBeat,
  usePracticeStore,
} from "../store/practiceStore";

export type PracticeSnapshot = ReturnType<typeof usePracticeStore.getState>;

export type PlaybackDisplayAnchor = {
  isPlaying: boolean;
  playbackEvents: PracticeSnapshot["playbackEvents"];
  positionBeats: number;
  time: number;
};

const MAX_POSITION_EXTRAPOLATION_SECONDS = 0.18;

export function createPlaybackDisplayAnchor(): PlaybackDisplayAnchor {
  const state = usePracticeStore.getState();

  return {
    isPlaying: state.isPlaying,
    playbackEvents: state.playbackEvents,
    positionBeats: state.positionBeats,
    time: window.performance.now(),
  };
}

export function displayPlaybackBeat(
  state: PracticeSnapshot,
  anchor: PlaybackDisplayAnchor,
  frameTime: number,
): number {
  if (
    state.positionBeats !== anchor.positionBeats ||
    state.isPlaying !== anchor.isPlaying ||
    state.playbackEvents !== anchor.playbackEvents
  ) {
    anchor.positionBeats = state.positionBeats;
    anchor.isPlaying = state.isPlaying;
    anchor.playbackEvents = state.playbackEvents;
    anchor.time = frameTime;
  }

  if (!state.score || !state.isPlaying) {
    return state.positionBeats;
  }

  const elapsedSeconds = Math.min(
    MAX_POSITION_EXTRAPOLATION_SECONDS,
    Math.max(0, (frameTime - anchor.time) / 1000),
  );
  const tempo = tempoAtPlaybackBeat(state.score, state.playbackEvents, anchor.positionBeats);
  const beatRate = (tempo / 60) * state.settings.speed;
  let nextPosition = anchor.positionBeats + elapsedSeconds * beatRate;
  const bounds = loopBounds(state.score, state.settings);
  if (bounds && nextPosition >= bounds.endBeat) {
    const loopDuration = Math.max(0.001, bounds.endBeat - bounds.startBeat);
    nextPosition = bounds.startBeat + ((nextPosition - bounds.startBeat) % loopDuration);
  } else {
    nextPosition = Math.min(nextPosition, playbackEndBeat(state.score, state.playbackEvents));
  }

  return nextPosition;
}
