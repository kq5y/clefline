import { memo, useMemo } from "react";
import { pianoKeyLayoutForMidi } from "../lib/pianoLayout";
import { buildGlissandoSegments } from "../lib/musicxml/glissando";
import { minimumPositionBeats, type HandMode } from "../store/practiceStore";
import type { NoteEvent, ScoreModel } from "../lib/musicxml";

type NoteRiverProps = {
  score?: ScoreModel;
  positionBeats: number;
  handMode: HandMode;
  riverZoom: number;
  showMeasureLines: boolean;
  showNoteNames: boolean;
};

const BASE_LOOK_AHEAD_BEATS = 4;
const LOOK_BEHIND_BEATS = 0.5;
const STRIKE_Y = 100;

type MeasureMarker = {
  index: number;
  number: string;
  startBeat: number;
};

type VisualNote = {
  note: NoteEvent;
  startBeat: number;
  durationBeats: number;
  endBeat: number;
};

type VisualScore = {
  maxDurationBeats: number;
  measures: MeasureMarker[];
  notes: VisualNote[];
};

const EMPTY_VISUAL_SCORE: VisualScore = {
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

function clampVisibleY(value: number): number {
  return Math.min(STRIKE_Y, Math.max(-10, value));
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

export const NoteRiver = memo(function NoteRiver({
  score,
  positionBeats,
  handMode,
  riverZoom,
  showMeasureLines,
  showNoteNames,
}: NoteRiverProps) {
  const lookAheadBeats = BASE_LOOK_AHEAD_BEATS / Math.max(0.5, riverZoom);
  const visualScore = useMemo<VisualScore>(() => {
    if (!score) {
      return EMPTY_VISUAL_SCORE;
    }

    let maxDurationBeats = 0;
    const notes = score.notes
      .map((note) => {
        const startBeat = visualStartBeat(note);
        const durationBeats = visualDurationBeats(note);
        maxDurationBeats = Math.max(maxDurationBeats, durationBeats);

        return {
          note,
          startBeat,
          durationBeats,
          endBeat: startBeat + durationBeats,
        };
      })
      .toSorted(
        (first, second) => first.startBeat - second.startBeat || first.note.midi - second.note.midi,
      );
    const measures = [
      { index: -1, number: "0", startBeat: minimumPositionBeats(score) },
      ...score.measures,
    ].toSorted((first, second) => first.startBeat - second.startBeat);

    return { maxDurationBeats, measures, notes };
  }, [score]);
  const notes = useMemo(() => {
    const windowStart = positionBeats - LOOK_BEHIND_BEATS;
    const windowEnd = positionBeats + lookAheadBeats;
    const startIndex = lowerBoundByStart(
      visualScore.notes,
      windowStart - visualScore.maxDurationBeats,
    );
    const endIndex = upperBoundByStart(visualScore.notes, windowEnd);

    return visualScore.notes
      .slice(startIndex, endIndex)
      .filter((note) => note.endBeat >= windowStart);
  }, [lookAheadBeats, positionBeats, visualScore]);
  const measureLines = useMemo<MeasureMarker[]>(() => {
    if (visualScore.measures.length === 0) {
      return [];
    }

    const startIndex = lowerBoundByStart(visualScore.measures, positionBeats);
    const endIndex = upperBoundByStart(visualScore.measures, positionBeats + lookAheadBeats);

    return visualScore.measures.slice(startIndex, endIndex);
  }, [lookAheadBeats, positionBeats, visualScore]);
  const allGlissandoSegments = useMemo(() => buildGlissandoSegments(score?.notes ?? []), [score]);
  const glissandoSegments = useMemo(
    () =>
      allGlissandoSegments.filter(
        (segment) =>
          segment.endBeat >= positionBeats - LOOK_BEHIND_BEATS &&
          segment.startBeat <= positionBeats + lookAheadBeats,
      ),
    [allGlissandoSegments, lookAheadBeats, positionBeats],
  );
  const activeLabels = useMemo(() => {
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
  }, [handMode, positionBeats, visualScore]);

  if (!score) {
    return (
      <div className="empty-state">
        <p>Load MusicXML to start practicing.</p>
      </div>
    );
  }

  return (
    <div className="note-river" aria-label="Falling notes">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {showMeasureLines
          ? measureLines.map((measure) => {
              const y = yForBeat(measure.startBeat, positionBeats, lookAheadBeats);

              return (
                <g className="measure-marker" key={measure.index}>
                  <line className="measure-line" x1="0" x2="100" y1={y} y2={y} />
                </g>
              );
            })
          : null}
        <line className="strike-line" x1="0" x2="100" y1={STRIKE_Y} y2={STRIKE_Y} />
        {glissandoSegments.map((segment) => {
          const startLayout = pianoKeyLayoutForMidi(segment.startMidi);
          const endLayout = pianoKeyLayoutForMidi(segment.endMidi);
          const startY = yForBeat(
            visualStartBeat(segment.startNote),
            positionBeats,
            lookAheadBeats,
          );
          const endY = yForBeat(visualStartBeat(segment.endNote), positionBeats, lookAheadBeats);
          const selected = includeVisual(handMode, segment.hand);

          return (
            <line
              className={`glissando-line ${segment.hand}`}
              key={segment.id}
              opacity={selected ? 1 : 0.18}
              x1={startLayout.centerPercent}
              x2={endLayout.centerPercent}
              y1={Math.min(STRIKE_Y, Math.max(0, startY))}
              y2={Math.min(STRIKE_Y, Math.max(0, endY))}
            />
          );
        })}
        {notes.map(({ note, startBeat, durationBeats }) => {
          const startY = yForBeat(startBeat, positionBeats, lookAheadBeats);
          const endY = yForBeat(startBeat + durationBeats, positionBeats, lookAheadBeats);
          const top = clampVisibleY(Math.min(startY, endY));
          const bottom = Math.min(STRIKE_Y, Math.max(startY, endY));
          const height = Math.max(1.2, bottom - top);
          const attackY = Math.min(STRIKE_Y, Math.max(0, startY));
          const layout = pianoKeyLayoutForMidi(note.midi);
          const x = layout.centerPercent - layout.noteWidthPercent / 2;
          const selected = includeVisual(handMode, note.hand);
          return (
            <g className="river-note-group" key={note.id} opacity={selected ? 1 : 0.18}>
              <rect
                className={`river-note ${note.hand} ${layout.black ? "black-note" : "white-note"}`}
                data-midi={note.midi}
                data-pitch={note.pitchName}
                x={x}
                y={top}
                width={layout.noteWidthPercent}
                height={height}
                rx={layout.black ? "0.16" : "0.22"}
              />
              <line
                className="note-release"
                x1={x}
                x2={x + layout.noteWidthPercent}
                y1={top}
                y2={top}
              />
              <line
                className="note-attack"
                x1={x}
                x2={x + layout.noteWidthPercent}
                y1={attackY}
                y2={attackY}
              />
            </g>
          );
        })}
      </svg>
      {showMeasureLines ? (
        <div className="measure-label-layer" aria-hidden="true">
          {measureLines.map((measure) => {
            const y = yForBeat(measure.startBeat, positionBeats, lookAheadBeats);

            return (
              <span
                className="measure-label"
                key={measure.index}
                style={{ top: `${Math.min(96, Math.max(2, y - 2.2))}%` }}
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
