import { afterEach, describe, expect, it } from "vitest";
import { clearPlaybackAnchor, playbackAnchorAgeSeconds, setPlaybackAnchor } from "./playbackAnchor";

afterEach(clearPlaybackAnchor);

describe("playbackAnchorAgeSeconds", () => {
  it("reports how long ago the clock committed a position", () => {
    setPlaybackAnchor(4, 1000);

    expect(playbackAnchorAgeSeconds(4, 1000)).toBe(0);
    expect(playbackAnchorAgeSeconds(4, 1066)).toBeCloseTo(0.066, 5);
  });

  it("never reports a negative age", () => {
    setPlaybackAnchor(4, 1000);

    expect(playbackAnchorAgeSeconds(4, 900)).toBe(0);
  });

  it("declines positions the clock did not publish", () => {
    setPlaybackAnchor(4, 1000);

    // A seek moved the position, so the stored value is already current.
    expect(playbackAnchorAgeSeconds(9, 1100)).toBeUndefined();
  });

  it("declines once the anchor is cleared", () => {
    setPlaybackAnchor(4, 1000);
    clearPlaybackAnchor();

    expect(playbackAnchorAgeSeconds(4, 1100)).toBeUndefined();
  });
});
