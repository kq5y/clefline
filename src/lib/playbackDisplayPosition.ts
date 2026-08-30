import { playbackAnchorAgeSeconds } from "./playbackAnchor";
import {
  loopBounds,
  playbackEndBeat,
  tempoAtPlaybackBeat,
  usePracticeStore,
} from "../store/practiceStore";

export type PracticeSnapshot = ReturnType<typeof usePracticeStore.getState>;

const MAX_POSITION_EXTRAPOLATION_SECONDS = 0.35;

/**
 * The animated views run every frame while the store position only moves every
 * commit, so the beat is extrapolated from the clock's anchor. A seek clears
 * the anchor, and the raw position is used until the clock republishes.
 */
export function displayPlaybackBeat(state: PracticeSnapshot, frameTime: number): number {
  if (!state.score || !state.isPlaying) {
    return state.positionBeats;
  }

  const anchorAge = playbackAnchorAgeSeconds(state.positionBeats, frameTime);
  if (anchorAge === undefined) {
    return state.positionBeats;
  }

  const elapsedSeconds = Math.min(MAX_POSITION_EXTRAPOLATION_SECONDS, anchorAge);
  const tempo = tempoAtPlaybackBeat(state.score, state.positionBeats);
  const beatRate = (tempo / 60) * state.settings.speed;
  let nextPosition = state.positionBeats + elapsedSeconds * beatRate;
  const bounds = loopBounds(state.score, state.settings);
  if (bounds && nextPosition >= bounds.endBeat) {
    const loopDuration = Math.max(0.001, bounds.endBeat - bounds.startBeat);
    nextPosition = bounds.startBeat + ((nextPosition - bounds.startBeat) % loopDuration);
  } else {
    nextPosition = Math.min(nextPosition, playbackEndBeat(state.score, state.playbackEvents));
  }

  return nextPosition;
}
