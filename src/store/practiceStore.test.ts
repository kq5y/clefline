import { describe, expect, it } from "vitest";
import {
  activeMidiAt,
  activeNotesAt,
  activePlaybackEventsAt,
  initialTempo,
  leadInBeats,
  loopBounds,
  minimumPositionBeats,
  playbackEndBeat,
  sourceBeatAt,
  tempoAtPlaybackBeat,
  tempoAtSourceBeat,
  usePracticeStore,
} from "./practiceStore";

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

    usePracticeStore.getState().setPosition(3.4);
    usePracticeStore.getState().seekByMeasures(-1);
    expect(usePracticeStore.getState().positionBeats).toBe(3);

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

describe("tempo resolution", () => {
  it("uses tempo directions at the current source and playback beat", () => {
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
      <direction><sound tempo="90"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <direction><sound tempo="150"/></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
    const store = usePracticeStore.getState();
    store.loadXml(xml, "tempo-change.musicxml");
    const state = usePracticeStore.getState();

    expect(tempoAtSourceBeat(state.score, 0)).toBe(90);
    expect(tempoAtSourceBeat(state.score, 1)).toBe(150);
    expect(tempoAtPlaybackBeat(state.score, state.playbackEvents, 0)).toBe(90);
    expect(tempoAtPlaybackBeat(state.score, state.playbackEvents, 1)).toBe(150);
  });

  it("defaults to 120 BPM when no tempo is specified", () => {
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
    usePracticeStore.getState().loadXml(xml, "no-tempo.musicxml");
    const state = usePracticeStore.getState();

    expect(initialTempo(state.score)).toBe(120);
    expect(tempoAtSourceBeat(state.score, 0)).toBe(120);
  });
});

describe("active notes and events", () => {
  const chordXml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  it("returns active playback events at a given position", () => {
    usePracticeStore.getState().loadXml(chordXml, "chord.musicxml");
    const state = usePracticeStore.getState();

    const eventsAt0 = activePlaybackEventsAt(state.playbackEvents, 0);
    const eventsAt1 = activePlaybackEventsAt(state.playbackEvents, 1);
    const eventsAt2 = activePlaybackEventsAt(state.playbackEvents, 2);

    expect(eventsAt0).toHaveLength(1);
    expect(eventsAt0[0].notes).toHaveLength(2); // C4 and E4 chord
    expect(eventsAt1).toHaveLength(1); // Still within the first event
    expect(eventsAt2).toHaveLength(1); // G4 starts at beat 2
  });

  it("returns active MIDI notes at a given position", () => {
    usePracticeStore.getState().loadXml(chordXml, "chord.musicxml");
    const state = usePracticeStore.getState();

    const midiAt0 = activeMidiAt(state.playbackEvents, 0);
    const midiAt1 = activeMidiAt(state.playbackEvents, 1);

    expect(midiAt0.toSorted()).toEqual([60, 64]); // C4=60, E4=64
    expect(midiAt1.toSorted()).toEqual([60, 64]); // Still playing
  });

  it("returns active notes with pitch names", () => {
    usePracticeStore.getState().loadXml(chordXml, "chord.musicxml");
    const state = usePracticeStore.getState();

    const notesAt0 = activeNotesAt(state.playbackEvents, 0);

    expect(notesAt0.map((n) => n.pitchName).toSorted()).toEqual(["C4", "E4"]);
    expect(notesAt0.every((n) => n.hand === "right")).toBe(true);
  });

  it("returns empty array when no notes are active", () => {
    usePracticeStore.getState().loadXml(chordXml, "chord.musicxml");
    const state = usePracticeStore.getState();

    const eventsAt10 = activePlaybackEventsAt(state.playbackEvents, 10);

    expect(eventsAt10).toEqual([]);
  });
});

describe("sourceBeatAt", () => {
  it("maps playback beats to source beats in simple scores", () => {
    usePracticeStore.getState().loadXml(simpleRepeatXml, "simple-repeat.musicxml");
    const state = usePracticeStore.getState();

    expect(sourceBeatAt(state.playbackEvents, 0)).toBeCloseTo(0, 2);
    expect(sourceBeatAt(state.playbackEvents, 1)).toBeCloseTo(1, 2);
  });

  it("handles expanded playback with repeats", () => {
    usePracticeStore.getState().loadXml(simpleRepeatXml, "simple-repeat.musicxml");
    const state = usePracticeStore.getState();

    // After the repeat, playback beat 4 should map back to source beat 1
    expect(sourceBeatAt(state.playbackEvents, 4)).toBeCloseTo(2, 2);
  });

  it("returns positionBeats for negative values", () => {
    usePracticeStore.getState().loadXml(simpleRepeatXml, "simple-repeat.musicxml");
    const state = usePracticeStore.getState();

    expect(sourceBeatAt(state.playbackEvents, -1)).toBe(-1);
  });
});

describe("loopBounds", () => {
  it("returns undefined when loop is disabled", () => {
    usePracticeStore.getState().loadXml(simpleRepeatXml, "simple-repeat.musicxml");
    const state = usePracticeStore.getState();

    expect(loopBounds(state.score, { ...state.settings, loopEnabled: false })).toBeUndefined();
  });

  it("returns start and end beats when loop is enabled with valid measures", () => {
    usePracticeStore.getState().loadXml(simpleRepeatXml, "simple-repeat.musicxml");
    const state = usePracticeStore.getState();

    const bounds = loopBounds(state.score, {
      ...state.settings,
      loopEnabled: true,
      loopStartMeasure: "2",
      loopEndMeasure: "3",
    });

    expect(bounds).toBeDefined();
    expect(bounds?.startBeat).toBe(1);
    expect(bounds?.endBeat).toBe(3);
  });

  it("returns undefined for invalid measure range", () => {
    usePracticeStore.getState().loadXml(simpleRepeatXml, "simple-repeat.musicxml");
    const state = usePracticeStore.getState();

    const bounds = loopBounds(state.score, {
      ...state.settings,
      loopEnabled: true,
      loopStartMeasure: "3",
      loopEndMeasure: "2",
    });

    expect(bounds).toBeUndefined();
  });
});

describe("playback timing helpers", () => {
  it("calculates lead-in beats based on first measure duration", () => {
    usePracticeStore.getState().loadXml(simpleRepeatXml, "simple-repeat.musicxml");
    const state = usePracticeStore.getState();

    expect(leadInBeats(state.score)).toBe(1);
    expect(minimumPositionBeats(state.score)).toBe(-1);
  });

  it("calculates playback end beat from events", () => {
    usePracticeStore.getState().loadXml(simpleRepeatXml, "simple-repeat.musicxml");
    const state = usePracticeStore.getState();

    const endBeat = playbackEndBeat(state.score, state.playbackEvents);

    expect(endBeat).toBeGreaterThan(0);
  });

  it("returns 0 for playback end when no score", () => {
    expect(playbackEndBeat(undefined, [])).toBe(0);
  });
});
