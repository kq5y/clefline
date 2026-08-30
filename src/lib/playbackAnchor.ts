/**
 * The playback clock only writes its position into the store every
 * VISIBLE_COMMIT_MS, so anyone reading `positionBeats` sees a value that is
 * already a few milliseconds old. The clock publishes the moment each value
 * became current here, which lets the audio scheduler and the animated views
 * extrapolate from the same anchor instead of drifting apart.
 */
type PlaybackAnchor = {
  beat: number;
  time: number;
};

let anchor: PlaybackAnchor | undefined;

export function setPlaybackAnchor(beat: number, time: number): void {
  anchor = { beat, time };
}

export function clearPlaybackAnchor(): void {
  anchor = undefined;
}

/**
 * Seconds elapsed since `positionBeats` was committed, or undefined when the
 * position was changed by something other than the clock (a seek), in which
 * case the value is already current and must not be extrapolated.
 */
export function playbackAnchorAgeSeconds(positionBeats: number, now: number): number | undefined {
  if (!anchor || anchor.beat !== positionBeats) {
    return undefined;
  }

  return Math.max(0, (now - anchor.time) / 1000);
}
