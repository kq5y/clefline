import { describe, expect, it } from "vitest";
import { parseMusicXml } from "./parse";
import {
  performanceBeatAtSourceBeat,
  performanceMeasures,
  sourceBeatAtPerformanceBeat,
} from "./performance";

// Measures 2-3 are repeated: the performance plays 1, 2, 3, 2, 3, 4.
const repeatXml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <barline location="left"><repeat direction="forward"/></barline>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="3">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <barline location="right"><repeat direction="backward"/></barline>
    </measure>
    <measure number="4">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

describe("sourceBeatAtPerformanceBeat", () => {
  it("maps the first pass one to one", () => {
    const score = parseMusicXml(repeatXml);

    expect(sourceBeatAtPerformanceBeat(score, 0)).toBeCloseTo(0, 5);
    expect(sourceBeatAtPerformanceBeat(score, 2.5)).toBeCloseTo(2.5, 5);
  });

  it("maps the repeated pass back onto the repeated measures", () => {
    const score = parseMusicXml(repeatXml);

    expect(sourceBeatAtPerformanceBeat(score, 3)).toBeCloseTo(1, 5);
    expect(sourceBeatAtPerformanceBeat(score, 4.5)).toBeCloseTo(2.5, 5);
    expect(sourceBeatAtPerformanceBeat(score, 5)).toBeCloseTo(3, 5);
  });

  it("passes lead-in beats through untouched", () => {
    const score = parseMusicXml(repeatXml);

    expect(sourceBeatAtPerformanceBeat(score, -1)).toBe(-1);
    expect(sourceBeatAtPerformanceBeat(undefined, 4)).toBe(4);
  });
});

describe("performanceBeatAtSourceBeat", () => {
  it("returns the pass closest to the current position", () => {
    const score = parseMusicXml(repeatXml);

    expect(performanceBeatAtSourceBeat(score, 1, 0)).toBeCloseTo(1, 5);
    expect(performanceBeatAtSourceBeat(score, 1, 3.4)).toBeCloseTo(3, 5);
    expect(performanceBeatAtSourceBeat(score, 3, 4)).toBeCloseTo(5, 5);
  });

  it("round trips with sourceBeatAtPerformanceBeat", () => {
    const score = parseMusicXml(repeatXml);

    for (const performanceBeat of [0, 1.5, 3.25, 4.75, 5.5]) {
      const sourceBeat = sourceBeatAtPerformanceBeat(score, performanceBeat);
      expect(performanceBeatAtSourceBeat(score, sourceBeat, performanceBeat)).toBeCloseTo(
        performanceBeat,
        5,
      );
    }
  });
});

describe("performanceMeasures", () => {
  it("lists every measure pass on the performance timeline", () => {
    const score = parseMusicXml(repeatXml);

    expect(performanceMeasures(score).map((measure) => measure.number)).toEqual([
      "1",
      "2",
      "3",
      "2",
      "3",
      "4",
    ]);
    expect(performanceMeasures(score).map((measure) => measure.absoluteBeat)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("covers the repeated passes of the Bach minuet sample structure", () => {
    const score = parseMusicXml(repeatXml);
    const measures = performanceMeasures(score);

    expect(measures).toHaveLength(6);
    expect(measures.at(-1)?.absoluteBeat).toBe(5);
  });
});
