import { describe, expect, it } from "vitest";
import { sanitizeScoreDisplayXml } from "./displayXml";

describe("sanitizeScoreDisplayXml", () => {
  it("converts MuseScore sym text into music symbols before OSMD rendering", () => {
    const xml = `<direction><direction-type><words>To &lt;sym&gt;Coda&lt;/sym&gt;</words></direction-type></direction>`;

    expect(sanitizeScoreDisplayXml(xml)).toContain("To Coda");
    expect(sanitizeScoreDisplayXml(xml)).not.toContain("&lt;sym&gt;");
    expect(sanitizeScoreDisplayXml("<words>To <sym>Coda<sym></words>")).toContain("To Coda");
    expect(sanitizeScoreDisplayXml("<direction-type><coda/></direction-type>")).toContain(
      "<words>Coda</words>",
    );
  });

  it("feeds glissando notation through OSMD's slide reader", () => {
    const xml = `<score-partwise><part><measure><note><notations><glissando type="start" number="1">gliss.</glissando></notations></note></measure></part></score-partwise>`;

    const sanitized = sanitizeScoreDisplayXml(xml);

    expect(sanitized).toContain('<slide type="start" number="1">gliss.</slide>');
    expect(sanitized).not.toContain("<glissando");
  });

  it("raises rehearsal labels away from notes", () => {
    const xml = `<score-partwise><part><measure><direction><direction-type><rehearsal default-y="6" relative-y="20">A</rehearsal></direction-type></direction></measure></part></score-partwise>`;

    const sanitized = sanitizeScoreDisplayXml(xml);

    expect(sanitized).toContain('default-y="42"');
    expect(sanitized).toContain('relative-y="36"');
  });

  it("promotes staff clefs placed before the first note on that staff", () => {
    const xml = `<score-partwise><part><measure><attributes><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><note><pitch><step>C</step><octave>5</octave></pitch><staff>1</staff></note><backup/><attributes><clef number="2" after-barline="yes"><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>E</step><octave>4</octave></pitch><staff>2</staff></note></measure></part></score-partwise>`;

    const sanitized = sanitizeScoreDisplayXml(xml);

    expect(sanitized).toContain('<clef number="2"><sign>G</sign><line>2</line></clef>');
    expect(sanitized).not.toContain('after-barline="yes"');
    expect(sanitized).not.toContain('<clef number="2"><sign>F</sign><line>4</line></clef>');
  });
});
