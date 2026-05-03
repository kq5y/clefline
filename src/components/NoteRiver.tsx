import type { HandMode } from "../store/practiceStore";
import type { ScoreModel } from "../lib/musicxml";

type NoteRiverProps = {
  score?: ScoreModel;
  positionBeats: number;
  handMode: HandMode;
  showNoteNames: boolean;
};

const LOOK_AHEAD_BEATS = 16;
const LOOK_BEHIND_BEATS = 1;

function includeVisual(handMode: HandMode, hand: string): boolean {
  return handMode === "both" || hand === handMode;
}

function xForMidi(midi: number): number {
  return ((midi - 21) / 87) * 100;
}

export function NoteRiver({ score, positionBeats, handMode, showNoteNames }: NoteRiverProps) {
  const notes =
    score?.notes.filter(
      (note) =>
        note.startBeat + note.durationBeats >= positionBeats - LOOK_BEHIND_BEATS &&
        note.startBeat <= positionBeats + LOOK_AHEAD_BEATS,
    ) ?? [];

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
        <line className="strike-line" x1="0" x2="100" y1="92" y2="92" />
        {notes.map((note) => {
          const delta = note.startBeat - positionBeats;
          const y = 92 - (delta / LOOK_AHEAD_BEATS) * 92;
          const height = Math.max(1.4, (note.durationBeats / LOOK_AHEAD_BEATS) * 92);
          const selected = includeVisual(handMode, note.hand);
          return (
            <g key={note.id} opacity={selected ? 1 : 0.22}>
              <rect
                className={note.hand === "left" ? "river-note left" : "river-note right"}
                x={xForMidi(note.midi) - 0.38}
                y={Math.max(-8, y - height)}
                width="0.76"
                height={height}
                rx="0.28"
              />
            </g>
          );
        })}
      </svg>
      {showNoteNames ? (
        <div className="current-readout">
          {score.notes
            .filter(
              (note) =>
                note.startBeat <= positionBeats &&
                note.startBeat + Math.max(note.durationBeats, 0.1) > positionBeats &&
                includeVisual(handMode, note.hand),
            )
            .slice(0, 12)
            .map((note) => (
              <span key={note.id}>{note.pitchName}</span>
            ))}
        </div>
      ) : null}
    </div>
  );
}
