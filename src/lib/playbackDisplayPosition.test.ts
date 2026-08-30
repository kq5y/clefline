import { afterEach, describe, expect, it } from "vitest";
import { clearPlaybackAnchor, setPlaybackAnchor } from "./playbackAnchor";
import { displayPlaybackBeat } from "./playbackDisplayPosition";
import { usePracticeStore } from "../store/practiceStore";

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

function playFrom(positionBeats: number, anchorTime: number): void {
  usePracticeStore.getState().loadXml(simpleXml, "test.musicxml");
  usePracticeStore.getState().setPosition(positionBeats);
  usePracticeStore.getState().setPlaying(true);
  setPlaybackAnchor(usePracticeStore.getState().positionBeats, anchorTime);
}

afterEach(() => {
  usePracticeStore.getState().setPlaying(false);
  clearPlaybackAnchor();
});

describe("displayPlaybackBeat", () => {
  it("returns the stored position when not playing", () => {
    usePracticeStore.getState().loadXml(simpleXml, "test.musicxml");
    usePracticeStore.getState().setPosition(1);

    expect(displayPlaybackBeat(usePracticeStore.getState(), 1000)).toBe(1);
  });

  it("extrapolates from the clock anchor while playing", () => {
    playFrom(0, 1000);

    // 120 BPM means 100ms of wall clock is 0.2 beats.
    expect(displayPlaybackBeat(usePracticeStore.getState(), 1100)).toBeCloseTo(0.2, 5);
  });

  it("does not extrapolate a position the clock has not committed", () => {
    playFrom(0, 1000);
    usePracticeStore.getState().setPosition(2);

    expect(displayPlaybackBeat(usePracticeStore.getState(), 1100)).toBe(2);
  });

  it("limits how far ahead of the anchor it will run", () => {
    playFrom(0, 1000);

    // Two seconds would be 4 beats; the cap keeps it far below that.
    expect(displayPlaybackBeat(usePracticeStore.getState(), 3000)).toBeLessThan(1);
  });

  it("does not run past the end of the score", () => {
    playFrom(3.9, 1000);

    expect(displayPlaybackBeat(usePracticeStore.getState(), 1300)).toBeLessThanOrEqual(4);
  });

  it("wraps back to the loop start", () => {
    usePracticeStore.getState().loadXml(simpleXml, "test.musicxml");
    usePracticeStore.getState().updateSettings({
      loopEnabled: true,
      loopStartMeasure: "1",
      loopEndMeasure: "1",
    });
    usePracticeStore.getState().setPosition(3.9);
    usePracticeStore.getState().setPlaying(true);
    setPlaybackAnchor(usePracticeStore.getState().positionBeats, 1000);

    expect(displayPlaybackBeat(usePracticeStore.getState(), 1200)).toBeLessThan(1);
  });
});
