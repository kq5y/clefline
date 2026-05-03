import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pianoKeyLayoutForMidi, type PianoKeyLayout } from "../lib/pianoLayout";
import { buildGlissandoSegments } from "../lib/musicxml/glissando";
import {
  minimumPositionBeats,
  sourceBeatAt,
  usePracticeStore,
  type HandMode,
} from "../store/practiceStore";
import type { NoteEvent, ScoreModel } from "../lib/musicxml";

type NoteRiverProps = {
  score?: ScoreModel;
  handMode: HandMode;
  riverZoom: number;
  showMeasureLines: boolean;
  showNoteNames: boolean;
};

const BASE_LOOK_AHEAD_BEATS = 4;
const RENDER_BUFFER_BEATS = 2.5;
const REANCHOR_AHEAD_BEATS = 1.45;
const REANCHOR_BEHIND_BEATS = 0.55;
const LOOK_BEHIND_BEATS = 0.5;
const SPAWN_Y = 18;
const STRIKE_Y = 100;
const VIEWBOX_HEIGHT = STRIKE_Y + SPAWN_Y;
const VIEWBOX_TOP = -SPAWN_Y;
const MIN_NOTE_HEIGHT_Y = 1.2;

type MeasureMarker = {
  index: number;
  number: string;
  startBeat: number;
};

type VisualNote = {
  className: string;
  durationBeats: number;
  endBeat: number;
  layout: PianoKeyLayout;
  note: NoteEvent;
  rx: string;
  startBeat: number;
  x: number;
};

type VisualGlissandoSegment = {
  endBeat: number;
  endX: number;
  hand: string;
  id: string;
  startBeat: number;
  startX: number;
};

type VisualScore = {
  glissandoSegments: VisualGlissandoSegment[];
  maxDurationBeats: number;
  measures: MeasureMarker[];
  notes: VisualNote[];
};

const EMPTY_VISUAL_SCORE: VisualScore = {
  glissandoSegments: [],
  maxDurationBeats: 0,
  measures: [],
  notes: [],
};

function includeVisual(handMode: HandMode, hand: string): boolean {
  return handMode === "both" || hand === handMode;
}

function yForBeat(beat: number, positionBeats: number, lookAheadBeats: number): number {
  return STRIKE_Y - ((beat - positionBeats) / lookAheadBeats) * STRIKE_Y;
}

function yToPercent(value: number): number {
  return ((value - VIEWBOX_TOP) / VIEWBOX_HEIGHT) * 100;
}

function isLongGrace(note: NoteEvent): boolean {
  return note.notations.some((notation) => notation.type === "grace" && notation.value === "long");
}

function visualStartBeat(note: NoteEvent): number {
  if (!note.isGrace) {
    return note.startBeat;
  }

  return note.startBeat - (isLongGrace(note) ? 0.32 : 0.14);
}

function visualDurationBeats(note: NoteEvent): number {
  if (!note.isGrace) {
    return note.durationBeats;
  }

  return isLongGrace(note) ? Math.max(0.24, Math.min(note.durationBeats || 0.28, 0.45)) : 0.14;
}

function buildTiedVisualDurationMap(notes: NoteEvent[]): Map<string, number> {
  const groups = new Map<string, NoteEvent[]>();
  const durations = new Map<string, number>();

  for (const note of notes) {
    if (!note.tieGroupId) {
      continue;
    }

    groups.set(note.tieGroupId, [...(groups.get(note.tieGroupId) ?? []), note]);
  }

  for (const group of groups.values()) {
    let chainStart: NoteEvent | undefined;
    let chainDuration = 0;
    for (const note of group.toSorted((a, b) => a.startBeat - b.startBeat)) {
      chainStart ??= note;
      chainDuration += visualDurationBeats(note);

      if (!note.tieStart) {
        if (chainDuration > visualDurationBeats(chainStart)) {
          durations.set(chainStart.id, chainDuration);
        }
        chainStart = undefined;
        chainDuration = 0;
      }
    }

    if (chainStart && chainDuration > visualDurationBeats(chainStart)) {
      durations.set(chainStart.id, chainDuration);
    }
  }

  return durations;
}

function lowerBoundByStart<T extends { startBeat: number }>(items: T[], beat: number): number {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (items[middle].startBeat < beat) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function upperBoundByStart<T extends { startBeat: number }>(items: T[], beat: number): number {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (items[middle].startBeat <= beat) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function currentDisplayBeat(): number {
  const state = usePracticeStore.getState();

  return sourceBeatAt(state.playbackEvents, state.positionBeats);
}

function activeLabelNotesAt(
  visualScore: VisualScore,
  positionBeats: number,
  handMode: HandMode,
): NoteEvent[] {
  const startIndex = lowerBoundByStart(
    visualScore.notes,
    positionBeats - Math.max(visualScore.maxDurationBeats, 0.1),
  );
  const endIndex = upperBoundByStart(visualScore.notes, positionBeats);

  return visualScore.notes
    .slice(startIndex, endIndex)
    .filter(
      ({ note, startBeat, durationBeats }) =>
        startBeat <= positionBeats &&
        startBeat + Math.max(durationBeats, 0.1) > positionBeats &&
        includeVisual(handMode, note.hand),
    )
    .slice(0, 12)
    .map(({ note }) => note);
}

function noteLabelSignature(notes: NoteEvent[]): string {
  let signature = "";
  for (const note of notes) {
    signature += `${note.id};`;
  }

  return signature;
}

export const NoteRiver = memo(function NoteRiver({
  score,
  handMode,
  riverZoom,
  showMeasureLines,
  showNoteNames,
}: NoteRiverProps) {
  const lookAheadBeats = BASE_LOOK_AHEAD_BEATS / Math.max(0.5, riverZoom);
  const [windowBeat, setWindowBeat] = useState(currentDisplayBeat);
  const [activeLabels, setActiveLabels] = useState<NoteEvent[]>([]);
  const motionGroupRef = useRef<SVGGElement | null>(null);
  const measureLabelLayerRef = useRef<HTMLDivElement | null>(null);
  const windowBeatRef = useRef(windowBeat);
  const pendingWindowBeatRef = useRef<number | undefined>(undefined);
  const latestPositionBeatRef = useRef(windowBeat);
  const lookAheadBeatsRef = useRef(lookAheadBeats);
  const visualScoreRef = useRef<VisualScore>(EMPTY_VISUAL_SCORE);
  const handModeRef = useRef(handMode);
  const showNoteNamesRef = useRef(showNoteNames);
  const labelSignatureRef = useRef("");
  const visualScore = useMemo<VisualScore>(() => {
    if (!score) {
      return EMPTY_VISUAL_SCORE;
    }

    let maxDurationBeats = 0;
    const tiedDurations = buildTiedVisualDurationMap(score.notes);
    const notes = score.notes
      .filter((note) => !note.tieStop)
      .map((note) => {
        const startBeat = visualStartBeat(note);
        const durationBeats = tiedDurations.get(note.id) ?? visualDurationBeats(note);
        const layout = pianoKeyLayoutForMidi(note.midi);
        maxDurationBeats = Math.max(maxDurationBeats, durationBeats);

        return {
          className: `river-note ${note.hand} ${layout.black ? "black-note" : "white-note"}`,
          durationBeats,
          endBeat: startBeat + durationBeats,
          layout,
          note,
          rx: layout.black ? "0.16" : "0.22",
          startBeat,
          x: layout.centerPercent - layout.noteWidthPercent / 2,
        };
      })
      .toSorted(
        (first, second) => first.startBeat - second.startBeat || first.note.midi - second.note.midi,
      );
    const measures = [
      { index: -1, number: "0", startBeat: minimumPositionBeats(score) },
      ...score.measures,
    ].toSorted((first, second) => first.startBeat - second.startBeat);
    const glissandoSegments = buildGlissandoSegments(score.notes).map((segment) => {
      const startLayout = pianoKeyLayoutForMidi(segment.startMidi);
      const endLayout = pianoKeyLayoutForMidi(segment.endMidi);

      return {
        endBeat: visualStartBeat(segment.endNote),
        endX: endLayout.centerPercent,
        hand: segment.hand,
        id: segment.id,
        startBeat: visualStartBeat(segment.startNote),
        startX: startLayout.centerPercent,
      };
    });

    return { glissandoSegments, maxDurationBeats, measures, notes };
  }, [score]);
  visualScoreRef.current = visualScore;
  handModeRef.current = handMode;
  showNoteNamesRef.current = showNoteNames;
  lookAheadBeatsRef.current = lookAheadBeats;
  const notes = useMemo(() => {
    const windowStart = windowBeat - LOOK_BEHIND_BEATS - RENDER_BUFFER_BEATS;
    const windowEnd = windowBeat + lookAheadBeats + RENDER_BUFFER_BEATS;
    const startIndex = lowerBoundByStart(
      visualScore.notes,
      windowStart - visualScore.maxDurationBeats,
    );
    const endIndex = upperBoundByStart(visualScore.notes, windowEnd);

    return visualScore.notes
      .slice(startIndex, endIndex)
      .filter((note) => note.endBeat >= windowStart);
  }, [lookAheadBeats, visualScore, windowBeat]);
  const measureLines = useMemo<MeasureMarker[]>(() => {
    if (visualScore.measures.length === 0) {
      return [];
    }

    const startIndex = lowerBoundByStart(
      visualScore.measures,
      windowBeat - LOOK_BEHIND_BEATS - RENDER_BUFFER_BEATS,
    );
    const endIndex = upperBoundByStart(
      visualScore.measures,
      windowBeat + lookAheadBeats + RENDER_BUFFER_BEATS,
    );

    return visualScore.measures.slice(startIndex, endIndex);
  }, [lookAheadBeats, visualScore, windowBeat]);
  const glissandoSegments = useMemo(
    () =>
      visualScore.glissandoSegments.filter(
        (segment) =>
          segment.endBeat >= windowBeat - LOOK_BEHIND_BEATS - RENDER_BUFFER_BEATS &&
          segment.startBeat <= windowBeat + lookAheadBeats + RENDER_BUFFER_BEATS,
      ),
    [lookAheadBeats, visualScore, windowBeat],
  );
  const updateMotion = useCallback((positionBeats: number) => {
    const deltaY = ((positionBeats - windowBeatRef.current) / lookAheadBeatsRef.current) * STRIKE_Y;
    motionGroupRef.current?.setAttribute("transform", `translate(0 ${deltaY.toFixed(3)})`);
    if (measureLabelLayerRef.current) {
      const deltaPercent = (deltaY / VIEWBOX_HEIGHT) * 100;
      measureLabelLayerRef.current.style.transform = `translate3d(0, ${deltaPercent.toFixed(3)}%, 0)`;
    }
  }, []);

  useEffect(() => {
    const nextBeat = currentDisplayBeat();
    latestPositionBeatRef.current = nextBeat;
    windowBeatRef.current = nextBeat;
    pendingWindowBeatRef.current = undefined;
    setWindowBeat(nextBeat);
    updateMotion(nextBeat);
  }, [score, updateMotion]);

  useLayoutEffect(() => {
    windowBeatRef.current = windowBeat;
    pendingWindowBeatRef.current = undefined;
    updateMotion(latestPositionBeatRef.current);
  }, [updateMotion, windowBeat]);

  useEffect(() => {
    const update = () => {
      const positionBeats = currentDisplayBeat();
      latestPositionBeatRef.current = positionBeats;
      const currentWindowBeat = windowBeatRef.current;
      if (
        pendingWindowBeatRef.current === undefined &&
        (positionBeats < currentWindowBeat - REANCHOR_BEHIND_BEATS ||
          positionBeats > currentWindowBeat + REANCHOR_AHEAD_BEATS)
      ) {
        pendingWindowBeatRef.current = positionBeats;
        setWindowBeat(positionBeats);
      }

      updateMotion(positionBeats);
      if (!showNoteNamesRef.current) {
        return;
      }

      const nextLabels = activeLabelNotesAt(
        visualScoreRef.current,
        positionBeats,
        handModeRef.current,
      );
      const nextSignature = noteLabelSignature(nextLabels);
      if (nextSignature !== labelSignatureRef.current) {
        labelSignatureRef.current = nextSignature;
        setActiveLabels(nextLabels);
      }
    };

    update();

    return usePracticeStore.subscribe((nextState, previousState) => {
      if (
        nextState.positionBeats !== previousState.positionBeats ||
        nextState.playbackEvents !== previousState.playbackEvents
      ) {
        update();
      }
    });
  }, [updateMotion]);

  useEffect(() => {
    if (!showNoteNames) {
      labelSignatureRef.current = "";
      setActiveLabels([]);
      return;
    }

    const nextLabels = activeLabelNotesAt(visualScore, currentDisplayBeat(), handMode);
    labelSignatureRef.current = noteLabelSignature(nextLabels);
    setActiveLabels(nextLabels);
  }, [handMode, showNoteNames, visualScore]);

  if (!score) {
    return (
      <div className="empty-state">
        <p>Load MusicXML to start practicing.</p>
      </div>
    );
  }

  return (
    <div className="note-river" aria-label="Falling notes">
      <svg viewBox={`0 ${VIEWBOX_TOP} 100 ${VIEWBOX_HEIGHT}`} preserveAspectRatio="none">
        <g className="river-motion-layer" ref={motionGroupRef}>
          {showMeasureLines
            ? measureLines.map((measure) => {
                const y = yForBeat(measure.startBeat, windowBeat, lookAheadBeats);

                return (
                  <g className="measure-marker" key={measure.index}>
                    <line className="measure-line" x1="0" x2="100" y1={y} y2={y} />
                  </g>
                );
              })
            : null}
          {glissandoSegments.map((segment) => {
            const startY = yForBeat(segment.startBeat, windowBeat, lookAheadBeats);
            const endY = yForBeat(segment.endBeat, windowBeat, lookAheadBeats);
            const selected = includeVisual(handMode, segment.hand);

            return (
              <line
                className={`glissando-line ${segment.hand}`}
                key={segment.id}
                opacity={selected ? 1 : 0.18}
                x1={segment.startX}
                x2={segment.endX}
                y1={startY}
                y2={endY}
              />
            );
          })}
          {notes.map(({ className, durationBeats, layout, note, rx, startBeat, x }) => {
            const startY = yForBeat(startBeat, windowBeat, lookAheadBeats);
            const endY = yForBeat(startBeat + durationBeats, windowBeat, lookAheadBeats);
            const top = Math.min(startY, endY);
            const bottom = Math.max(startY, endY);
            const height = Math.max(MIN_NOTE_HEIGHT_Y, bottom - top);
            const releaseY = endY;
            const selected = includeVisual(handMode, note.hand);
            return (
              <g className="river-note-group" key={note.id} opacity={selected ? 1 : 0.18}>
                <rect
                  className={className}
                  data-midi={note.midi}
                  data-pitch={note.pitchName}
                  x={x}
                  y={top}
                  width={layout.noteWidthPercent}
                  height={height}
                  rx={rx}
                />
                <line
                  className="note-release"
                  x1={x}
                  x2={x + layout.noteWidthPercent}
                  y1={releaseY}
                  y2={releaseY}
                />
                <line
                  className="note-attack"
                  x1={x}
                  x2={x + layout.noteWidthPercent}
                  y1={startY}
                  y2={startY}
                />
              </g>
            );
          })}
        </g>
        <line className="strike-line" x1="0" x2="100" y1={STRIKE_Y} y2={STRIKE_Y} />
      </svg>
      {showMeasureLines ? (
        <div className="measure-label-layer" ref={measureLabelLayerRef} aria-hidden="true">
          {measureLines.map((measure) => {
            const y = yForBeat(measure.startBeat, windowBeat, lookAheadBeats);
            const top = yToPercent(y);

            return (
              <span
                className="measure-label"
                key={measure.index}
                style={{ top: `${Math.min(96, Math.max(2, top - 2.2))}%` }}
              >
                {measure.number}
              </span>
            );
          })}
        </div>
      ) : null}
      {showNoteNames ? (
        <div className="current-readout">
          {activeLabels.map((note) => (
            <span key={note.id}>{note.pitchName}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
});
