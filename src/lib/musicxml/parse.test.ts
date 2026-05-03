import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusicXml } from "./parse";
import { buildPlaybackEvents } from "./timeline";

const samplePath = resolve(process.cwd(), "public/samples/sample_science.musicxml");

describe("parseMusicXml", () => {
  it("extracts the public science sample into a practice score model", async () => {
    const xml = await readFile(samplePath, "utf8");
    const score = parseMusicXml(xml);
    const playback = buildPlaybackEvents(score);

    expect(score.metadata.title).toBe("Science");
    expect(score.metadata.software).toContain("MuseScore");
    expect(score.measures).toHaveLength(89);
    expect(score.notes.length).toBeGreaterThan(1000);
    expect(playback.length).toBeGreaterThan(500);
    expect(score.directions.some((direction) => direction.kind === "dynamic")).toBe(true);
    expect(score.directions.filter((direction) => direction.kind === "wedge")).toHaveLength(6);
    expect(score.notes.filter((note) => note.tieStart)).toHaveLength(54);
    expect(score.notes.filter((note) => note.tieStop)).toHaveLength(54);
    expect(score.notes.some((note) => note.notations.some((n) => n.type === "arpeggiate"))).toBe(
      true,
    );
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
});
