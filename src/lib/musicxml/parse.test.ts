import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseMusicXml } from "./parse";
import { buildMetronomeClicks, buildPlaybackEvents, buildPlaybackSections } from "./timeline";

const samplePath = resolve(process.cwd(), "public/samples/bach-minuet.mxl");

async function loadMxl(path: string): Promise<string> {
  const buffer = await readFile(path);
  const zip = await JSZip.loadAsync(buffer);
  const xmlFile = Object.keys(zip.files).find(
    (p) => p.toLowerCase().endsWith(".xml") && !p.startsWith("META-INF/"),
  );
  if (!xmlFile) throw new Error("No XML file found in MXL");
  return zip.file(xmlFile)!.async("text");
}

describe("parseMusicXml", () => {
  it("extracts the public Bach minuet sample into a practice score model", async () => {
    const xml = await loadMxl(samplePath);
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

  it("keeps notation duration separate from pedal sustain", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction><direction-type><pedal type="start"/></direction-type></direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
        <notations><tied type="start"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
        <notations><tied type="stop"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <forward><duration>12</duration></forward>
      <direction><direction-type><pedal type="stop"/></direction-type></direction>
    </measure>
  </part>
</score-partwise>`;
    const score = parseMusicXml(xml);
    const playback = buildPlaybackEvents(score);

    expect(playback.map((event) => event.notes[0].pitchName)).toEqual(["C4", "D4"]);
    expect(playback[0].durationBeats).toBe(4);
    expect(playback[0].notationDurationBeats).toBe(0.75);
    expect(playback[1].durationBeats).toBe(3.25);
    expect(playback[1].notationDurationBeats).toBe(0.25);
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

describe("direction ordering", () => {
  const backupXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <direction placement="above">
        <direction-type><dynamics><ff/></dynamics></direction-type>
        <staff>1</staff>
      </direction>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <direction placement="below">
        <direction-type><dynamics><pp/></dynamics></direction-type>
        <sound tempo="60"/>
        <staff>2</staff>
      </direction>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

  it("sorts directions by beat across staves split by backup", () => {
    const score = parseMusicXml(backupXml);
    const beats = score.directions.map((direction) => direction.beat);

    expect(beats).toEqual(beats.toSorted((first, second) => first - second));
    expect(score.directions[0].beat).toBe(0);
    expect(score.directions.find((direction) => direction.kind === "tempo")?.beat).toBe(0);
  });
});

describe("multi-part scores", () => {
  const twoPartXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Right</part-name></score-part>
    <score-part id="P2"><part-name>Left</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>2</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>2</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;

  it("merges both parts and splits them into hands", () => {
    const score = parseMusicXml(twoPartXml);

    expect(score.measures).toHaveLength(2);
    expect(score.totalBeats).toBe(4);
    expect(score.notes).toHaveLength(5);
    expect(
      score.notes.filter((note) => note.hand === "right").map((note) => note.pitchName),
    ).toEqual(["C5", "D5", "E5"]);
    expect(
      score.notes.filter((note) => note.hand === "left").map((note) => note.pitchName),
    ).toEqual(["C3", "G2"]);
    expect(score.warnings.map((warning) => warning.code)).toContain("multiple-parts");
  });

  it("aligns parts that use different divisions", () => {
    const score = parseMusicXml(twoPartXml);
    const startBeats = new Map(score.notes.map((note) => [note.pitchName, note.startBeat]));

    expect(startBeats.get("C5")).toBe(0);
    expect(startBeats.get("C3")).toBe(0);
    expect(startBeats.get("E5")).toBe(2);
    expect(startBeats.get("G2")).toBe(2);
  });

  it("keeps the hands in separate playback events", () => {
    const score = parseMusicXml(twoPartXml);
    const atStart = buildPlaybackEvents(score).filter((event) => event.absoluteBeat === 0);

    expect(atStart).toHaveLength(2);
    expect(atStart.map((event) => event.hand).toSorted()).toEqual(["left", "right"]);
    expect(
      buildPlaybackEvents(score, { handMode: "left" }).every((event) => event.hand === "left"),
    ).toBe(true);
  });
});
