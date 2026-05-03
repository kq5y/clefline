import { memo, useMemo } from "react";
import { pianoKeyLayoutForMidi } from "../lib/pianoLayout";
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

export const NoteRiver = memo(function NoteRiver({
  score,
  positionBeats,
  handMode,
  riverZoom,
  showMeasureLines,
  showNoteNames,
}: NoteRiverProps) {
  const lookAheadBeats = BASE_LOOK_AHEAD_BEATS / Math.max(0.5, riverZoom);
  const notes = useMemo(
    () =>
      score?.notes.filter((note) => {
        const startBeat = visualStartBeat(note);

        return (
          startBeat + visualDurationBeats(note) >= positionBeats - LOOK_BEHIND_BEATS &&
          startBeat <= positionBeats + lookAheadBeats
        );
      }) ?? [],
    [lookAheadBeats, positionBeats, score],
  );
  const measureLines = useMemo<MeasureMarker[]>(() => {
    if (!score) {
      return [];
    }

    return [
      { index: -1, number: "0", startBeat: minimumPositionBeats(score) },
      ...score.measures,
    ].filter(
      (measure) =>
        measure.startBeat >= positionBeats && measure.startBeat <= positionBeats + lookAheadBeats,
    );
  }, [lookAheadBeats, positionBeats, score]);
  const activeLabels = useMemo(
    () =>
      score?.notes
        .filter(
          (note) =>
            visualStartBeat(note) <= positionBeats &&
            visualStartBeat(note) + Math.max(visualDurationBeats(note), 0.1) > positionBeats &&
            includeVisual(handMode, note.hand),
        )
        .slice(0, 12) ?? [],
    [handMode, positionBeats, score],
  );

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
        {notes.map((note) => {
          const startBeat = visualStartBeat(note);
          const durationBeats = visualDurationBeats(note);
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
