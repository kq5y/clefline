import { describe, expect, it } from "vitest";
import { usePracticeStore } from "./practiceStore";

const dsFineXml = `<?xml version="1.0" encoding="UTF-8"?>
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

const simpleRepeatXml = `<?xml version="1.0" encoding="UTF-8"?>
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

describe("practiceStore seeking", () => {
  it("keeps measure seeking on the repeated barline pass", () => {
    const store = usePracticeStore.getState();
    store.loadXml(simpleRepeatXml, "simple-repeat.musicxml");

    usePracticeStore.getState().setPosition(3);
    usePracticeStore.getState().seekByMeasures(1);
    expect(usePracticeStore.getState().positionBeats).toBe(4);

    usePracticeStore.getState().seekByMeasures(-1);
    expect(usePracticeStore.getState().positionBeats).toBe(3);

    usePracticeStore.getState().seekByMeasures(-1);
    expect(usePracticeStore.getState().positionBeats).toBe(2);
  });

  it("keeps measure seeking on the expanded playback pass", () => {
    const store = usePracticeStore.getState();
    store.loadXml(dsFineXml, "ds-fine.musicxml");

    usePracticeStore.getState().setPosition(5);
    usePracticeStore.getState().seekByMeasures(1);
    expect(usePracticeStore.getState().positionBeats).toBe(6);

    usePracticeStore.getState().seekByMeasures(-1);
    expect(usePracticeStore.getState().positionBeats).toBe(5);

    usePracticeStore.getState().seekByMeasures(-1);
    expect(usePracticeStore.getState().positionBeats).toBe(4);
  });
});
