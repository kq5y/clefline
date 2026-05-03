import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusicXml } from "./parse";
import { buildMetronomeClicks, buildPlaybackEvents, buildPlaybackSections } from "./timeline";

const samplePath = resolve(process.cwd(), "public/samples/bach-minuet.musicxml");

describe("parseMusicXml", () => {
  it("extracts the public Bach minuet sample into a practice score model", async () => {
    const xml = await readFile(samplePath, "utf8");
    const score = parseMusicXml(xml);
    const playback = buildPlaybackEvents(score);
    const sections = buildPlaybackSections(score);

    expect(score.metadata.title).toBe("Minuet in G Major");
    expect(score.metadata.partName).toBe("Piano");
    expect(score.metadata.software).toContain("MuseScore");
    expect(score.measures).toHaveLength(32);
    expect(score.notes.length).toBeGreaterThan(180);
    expect(playback.length).toBeGreaterThan(score.notes.length);
    expect(sections.length).toBeGreaterThan(1);
    expect(score.directions.some((direction) => direction.kind === "dynamic")).toBe(true);
    expect(score.directions.some((direction) => direction.kind === "wedge")).toBe(true);
    expect(score.measures.some((measure) => measure.repeatEnd)).toBe(true);
    expect(score.notes.some((note) => note.notations.some((n) => n.type === "staccato"))).toBe(
      true,
    );
  });

  it("separates long grace notes and rolls arpeggiated chords", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <grace/>
        <pitch><step>C</step><octave>4</octave></pitch>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations><arpeggiate direction="up"/></notations>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations><glissando type="start" number="1"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations><glissando type="stop" number="1"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const score = parseMusicXml(xml);
    const playback = buildPlaybackEvents(score);
    const grace = playback.find((event) => event.notationLabels.includes("grace"));
    const arpeggio = playback.find((event) => event.notationLabels.includes("arpeggiate"));

    expect(grace?.absoluteBeat).toBeLessThan(0);
    expect(grace?.notes).toHaveLength(1);
    expect(arpeggio?.rollOffsetBeats).toBeGreaterThan(0);
    expect(arpeggio?.notes.map((note) => note.pitchName)).toEqual(["C4", "E4"]);
    expect(
      score.notes.filter((note) => note.notations.some((n) => n.type === "glissando")),
    ).toHaveLength(2);
  });

  it("extends playback duration across tied notes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
        <notations><tied type="start"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations><tied type="stop"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const score = parseMusicXml(xml);
    const playback = buildPlaybackEvents(score);

    expect(playback.map((event) => event.notes[0].pitchName)).toEqual(["C4", "D4"]);
    expect(playback[0].durationBeats).toBe(3);
  });

  it("expands D.S. al Fine into the playback timeline", () => {
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
      <direction placement="above"><direction-type><words>Fine</words></direction-type></direction>
    </measure>
    <measure number="5">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <direction placement="above">
        <direction-type><words>D.S. al Fine</words></direction-type>
        <sound dalsegno="segno"/>
      </direction>
    </measure>
  </part>
</score-partwise>`;
    const score = parseMusicXml(xml);
    const playback = buildPlaybackEvents(score);

    expect(playback.map((event) => event.notes[0].pitchName)).toEqual([
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "D4",
      "E4",
      "F4",
    ]);
    expect(playback.at(-1)?.absoluteBeat).toBeGreaterThan(score.totalBeats);
  });

  it("expands simple repeat barlines into the playback timeline", () => {
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
    const score = parseMusicXml(xml);
    const playback = buildPlaybackEvents(score);
    const sections = buildPlaybackSections(score);

    expect(playback.map((event) => event.notes[0].pitchName)).toEqual([
      "C4",
      "D4",
      "E4",
      "D4",
      "E4",
      "F4",
    ]);
    expect(sections).toEqual([
      { performanceStartBeat: 0, sourceStartBeat: 0, sourceEndBeat: 3 },
      { performanceStartBeat: 3, sourceStartBeat: 1, sourceEndBeat: 4 },
    ]);
  });

  it("builds metronome clicks from the active time signature", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>6</beats><beat-type>8</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>6</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
    const score = parseMusicXml(xml);
    const clicks = buildMetronomeClicks(score);

    expect(score.measures[0].timeSignature).toEqual({ beats: 6, beatType: 8 });
    expect(clicks.map((click) => click.absoluteBeat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(clicks.map((click) => click.accented)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
