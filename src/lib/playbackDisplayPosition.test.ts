import { describe, expect, it } from "vitest";
import { usePracticeStore } from "../store/practiceStore";
import {
  createPlaybackDisplayAnchor,
  displayPlaybackBeat,
  type PlaybackDisplayAnchor,
} from "./playbackDisplayPosition";

const simpleXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction><sound tempo="120"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

describe("createPlaybackDisplayAnchor", () => {
  it("creates anchor from current store state", () => {
    usePracticeStore.getState().loadXml(simpleXml, "test.musicxml");
    usePracticeStore.getState().setPosition(2);

    const anchor = createPlaybackDisplayAnchor();

    expect(anchor.positionBeats).toBe(2);
    expect(anchor.isPlaying).toBe(false);
    expect(anchor.time).toBeGreaterThan(0);
  });
});

describe("displayPlaybackBeat", () => {
  it("returns current position when not playing", () => {
    usePracticeStore.getState().loadXml(simpleXml, "test.musicxml");
    usePracticeStore.getState().setPosition(1);

    const anchor = createPlaybackDisplayAnchor();
    const state = usePracticeStore.getState();

    const beat = displayPlaybackBeat(state, anchor, performance.now());

    expect(beat).toBe(1);
  });

  it("extrapolates position forward when playing", () => {
    usePracticeStore.getState().loadXml(simpleXml, "test.musicxml");
    usePracticeStore.getState().setPosition(0);
    usePracticeStore.getState().setPlaying(true);

    const now = performance.now();
    const anchor: PlaybackDisplayAnchor = {
      isPlaying: true,
      playbackEvents: usePracticeStore.getState().playbackEvents,
      positionBeats: 0,
      time: now - 100, // 100ms ago
    };
    const state = usePracticeStore.getState();

    const beat = displayPlaybackBeat(state, anchor, now);

    // At 120 BPM, 100ms = 0.2 beats
    expect(beat).toBeGreaterThan(0);
    expect(beat).toBeLessThan(0.5);

    usePracticeStore.getState().setPlaying(false);
  });

  it("updates anchor when state changes", () => {
    usePracticeStore.getState().loadXml(simpleXml, "test.musicxml");
    usePracticeStore.getState().setPosition(0);

    const anchor = createPlaybackDisplayAnchor();
    const initialTime = anchor.time;

    // Change position
    usePracticeStore.getState().setPosition(2);
    const newState = usePracticeStore.getState();
    const frameTime = performance.now();

    displayPlaybackBeat(newState, anchor, frameTime);

    expect(anchor.positionBeats).toBe(2);
    expect(anchor.time).toBe(frameTime);
    expect(anchor.time).not.toBe(initialTime);
  });

  it("limits extrapolation to prevent large jumps", () => {
    usePracticeStore.getState().loadXml(simpleXml, "test.musicxml");
    usePracticeStore.getState().setPosition(0);
    usePracticeStore.getState().setPlaying(true);

    const now = performance.now();
    const anchor: PlaybackDisplayAnchor = {
      isPlaying: true,
      playbackEvents: usePracticeStore.getState().playbackEvents,
      positionBeats: 0,
      time: now - 1000, // 1 second ago (would be 2 beats at 120 BPM)
    };
    const state = usePracticeStore.getState();

    const beat = displayPlaybackBeat(state, anchor, now);

    // Should be clamped by MAX_POSITION_EXTRAPOLATION_SECONDS (0.18s)
    expect(beat).toBeLessThan(1);

    usePracticeStore.getState().setPlaying(false);
  });

  it("does not exceed playback end beat", () => {
    usePracticeStore.getState().loadXml(simpleXml, "test.musicxml");
    usePracticeStore.getState().setPosition(3.9);
    usePracticeStore.getState().setPlaying(true);

    const now = performance.now();
    const anchor: PlaybackDisplayAnchor = {
      isPlaying: true,
      playbackEvents: usePracticeStore.getState().playbackEvents,
      positionBeats: 3.9,
      time: now - 500, // Would push past end
    };
    const state = usePracticeStore.getState();

    const beat = displayPlaybackBeat(state, anchor, now);

    expect(beat).toBeLessThanOrEqual(4);

    usePracticeStore.getState().setPlaying(false);
  });
});
