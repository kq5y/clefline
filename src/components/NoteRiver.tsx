import { memo, useMemo } from "react";
import type { HandMode } from "../store/practiceStore";
import type { ScoreModel } from "../lib/musicxml";

type NoteRiverProps = {
  score?: ScoreModel;
  positionBeats: number;
  handMode: HandMode;
  riverZoom: number;
  showMeasureLines: boolean;
  showNoteNames: boolean;
};

const BASE_LOOK_AHEAD_BEATS = 16;
const LOOK_BEHIND_BEATS = 0.5;
const STRIKE_Y = 100;

function includeVisual(handMode: HandMode, hand: string): boolean {
  return handMode === "both" || hand === handMode;
}

function xForMidi(midi: number): number {
  return ((midi - 21) / 87) * 100;
}

function yForBeat(beat: number, positionBeats: number, lookAheadBeats: number): number {
  return STRIKE_Y - ((beat - positionBeats) / lookAheadBeats) * STRIKE_Y;
}

function clampVisibleY(value: number): number {
  return Math.min(STRIKE_Y, Math.max(-10, value));
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
      score?.notes.filter(
        (note) =>
          note.startBeat + note.durationBeats >= positionBeats - LOOK_BEHIND_BEATS &&
          note.startBeat <= positionBeats + lookAheadBeats,
      ) ?? [],
    [lookAheadBeats, positionBeats, score],
  );
  const measureLines = useMemo(
    () =>
      score?.measures.filter(
        (measure) =>
          measure.startBeat >= positionBeats && measure.startBeat <= positionBeats + lookAheadBeats,
      ) ?? [],
    [lookAheadBeats, positionBeats, score],
  );
  const activeLabels = useMemo(
    () =>
      score?.notes
        .filter(
          (note) =>
            note.startBeat <= positionBeats &&
            note.startBeat + Math.max(note.durationBeats, 0.1) > positionBeats &&
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
        <defs>
          <linearGradient id="right-note" x1="0" x2="1">
            <stop offset="0%" stopColor="#f38e72" />
            <stop offset="100%" stopColor="#ffd166" />
          </linearGradient>
          <linearGradient id="left-note" x1="0" x2="1">
            <stop offset="0%" stopColor="#4cc9f0" />
            <stop offset="100%" stopColor="#72d6b0" />
          </linearGradient>
        </defs>
        {showMeasureLines
          ? measureLines.map((measure) => {
              const y = yForBeat(measure.startBeat, positionBeats, lookAheadBeats);

              return (
                <line className="measure-line" key={measure.index} x1="0" x2="100" y1={y} y2={y} />
              );
            })
          : null}
        <line className="strike-line" x1="0" x2="100" y1={STRIKE_Y} y2={STRIKE_Y} />
        {notes.map((note) => {
          const startY = yForBeat(note.startBeat, positionBeats, lookAheadBeats);
          const endY = yForBeat(note.startBeat + note.durationBeats, positionBeats, lookAheadBeats);
          const top = clampVisibleY(Math.min(startY, endY));
          const bottom = Math.min(STRIKE_Y, Math.max(startY, endY));
          const height = Math.max(1.2, bottom - top);
          const attackY = Math.min(STRIKE_Y, Math.max(0, startY));
          const selected = includeVisual(handMode, note.hand);
          return (
            <g className="river-note-group" key={note.id} opacity={selected ? 1 : 0.18}>
              <rect
                className={note.hand === "left" ? "river-note left" : "river-note right"}
                x={xForMidi(note.midi) - 0.38}
                y={top}
                width="0.76"
                height={height}
                rx="0.28"
              />
              <line
                className={note.hand === "left" ? "note-attack left" : "note-attack right"}
                x1={xForMidi(note.midi) - 0.38}
                x2={xForMidi(note.midi) + 0.38}
                y1={attackY}
                y2={attackY}
              />
            </g>
          );
        })}
      </svg>
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
