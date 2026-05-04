import { describe, expect, it } from "vitest";
import { buildPlaybackEvents, parseMusicXml } from "../lib/musicxml";
import { playbackEndBeat, type PracticeSettings } from "../store/practiceStore";
import {
  audioScheduleCatchupStartBeat,
  audioScheduleEndBeat,
  audioScheduleStartTime,
} from "./useTonePlayback";

const DEFAULT_TEST_SETTINGS: PracticeSettings = {
  viewMode: "river",
  speed: 1,
  riverZoom: 1,
  riverRange: { minMidi: 21, maxMidi: 108 },
  showMeasureLines: true,
  loopEnabled: false,
  handMode: "both",
  volume: 0.75,
  metronomeEnabled: false,
  showNoteNames: true,
};

const SIMPLE_SCORE_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

describe("audio scheduler timing", () => {
  it("keeps a short late window so overdue notes are not skipped", () => {
    const score = parseMusicXml(SIMPLE_SCORE_XML);
    const events = buildPlaybackEvents(score);

    expect(audioScheduleCatchupStartBeat(score, events, 2, DEFAULT_TEST_SETTINGS)).toBeCloseTo(
      0.8,
      3,
    );
  });

  it("schedules overdue notes just ahead of the current audio time", () => {
    const score = parseMusicXml(SIMPLE_SCORE_XML);
    const events = buildPlaybackEvents(score);

    expect(audioScheduleStartTime(10, score, events, 2, 1.9, DEFAULT_TEST_SETTINGS)).toBeCloseTo(
      10.004,
      3,
    );
  });

  it("uses the same audio-time origin for future notes in a scheduling pass", () => {
    const score = parseMusicXml(SIMPLE_SCORE_XML);
    const events = buildPlaybackEvents(score);

    expect(audioScheduleStartTime(10, score, events, 2, 3, DEFAULT_TEST_SETTINGS)).toBeCloseTo(
      10.5,
      3,
    );
  });
});

describe("audioScheduleEndBeat", () => {
  it("uses the expanded playback end instead of the raw score end", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>1</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <direction placement="above"><direction-type><segno/></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="3">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="4">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <direction placement="above">
        <direction-type><words>To &lt;sym&gt;coda&lt;/sym&gt;</words></direction-type>
        <sound tocoda="codab"/>
      </direction>
    </measure>
    <measure number="5">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <direction placement="above">
        <direction-type><words>D.S. al Coda</words></direction-type>
        <sound dalsegno="segno"/>
      </direction>
    </measure>
    <measure number="6">
      <direction placement="above"><direction-type><coda/></direction-type><sound coda="codab"/></direction>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="7">
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
    const score = parseMusicXml(xml);
    const events = buildPlaybackEvents(score);
    const expandedEnd = playbackEndBeat(score, events);

    expect(expandedEnd).toBeGreaterThan(score.totalBeats);
    expect(audioScheduleEndBeat(score, events, DEFAULT_TEST_SETTINGS)).toBe(expandedEnd);
  });
});
