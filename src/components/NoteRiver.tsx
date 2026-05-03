import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pianoKeyLayoutForMidi, type PianoKeyLayout } from "../lib/pianoLayout";
import { buildGlissandoSegments } from "../lib/musicxml/glissando";
import {
  minimumPositionBeats,
  sourceBeatAt,
  usePracticeStore,
  type HandMode,
} from "../store/practiceStore";
import type { Hand, NoteEvent, ScoreModel } from "../lib/musicxml";

type NoteRiverProps = {
  score?: ScoreModel;
  handMode: HandMode;
  riverZoom: number;
  showMeasureLines: boolean;
  showNoteNames: boolean;
};

const BASE_LOOK_AHEAD_BEATS = 4;
const LOOK_BEHIND_BEATS = 0.5;
const SPAWN_Y = 18;
const STRIKE_Y = 100;
const VIEWBOX_HEIGHT = STRIKE_Y + SPAWN_Y;
const VIEWBOX_TOP = -SPAWN_Y;
const MIN_NOTE_HEIGHT_Y = 1.2;
const MEASURE_LABEL_HEIGHT_PX = 20;
const MEASURE_LABEL_EDGE_PADDING_PX = 6;

const NOTE_COLORS: Record<Hand, { black: string; white: string }> = {
  left: { black: "#1f8093", white: "#52c7e8" },
  right: { black: "#b85a3a", white: "#f7a56e" },
  unknown: { black: "#8d6d25", white: "#d4a23c" },
};
const GLISSANDO_COLORS: Record<Hand, string> = {
  left: "#83dcf4",
  right: "#ffd0ad",
  unknown: "#ffe099",
};

type MeasureMarker = {
  index: number;
  number: string;
  startBeat: number;
};

type VisualNote = {
  durationBeats: number;
  endBeat: number;
  layout: PianoKeyLayout;
  note: NoteEvent;
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

function yUnitToPx(y: number, height: number): number {
  return ((y - VIEWBOX_TOP) / VIEWBOX_HEIGHT) * height;
}

function percentToPx(percent: number, width: number): number {
  return (percent / 100) * width;
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

    const group = groups.get(note.tieGroupId);
    if (group) {
      group.push(note);
    } else {
      groups.set(note.tieGroupId, [note]);
    }
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
  const notes: NoteEvent[] = [];

  for (let index = startIndex; index < endIndex && notes.length < 12; index += 1) {
    const visualNote = visualScore.notes[index];
    if (
      visualNote.startBeat <= positionBeats &&
      visualNote.endBeat > positionBeats &&
      includeVisual(handMode, visualNote.note.hand)
    ) {
      notes.push(visualNote.note);
    }
  }

  return notes;
}

function noteLabelSignature(notes: NoteEvent[]): string {
  let signature = "";
  for (const note of notes) {
    signature += `${note.id};`;
  }

  return signature;
}

function canvasSize(canvas: HTMLCanvasElement): { height: number; width: number } {
  return {
    height: canvas.clientHeight,
    width: canvas.clientWidth,
  };
}

function resizeCanvas(canvas: HTMLCanvasElement): boolean {
  const { height, width } = canvasSize(canvas);
  const pixelRatio = window.devicePixelRatio || 1;
  const nextWidth = Math.max(1, Math.round(width * pixelRatio));
  const nextHeight = Math.max(1, Math.round(height * pixelRatio));
  const changed = canvas.width !== nextWidth || canvas.height !== nextHeight;

  if (changed) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  const context = canvas.getContext("2d");
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  return changed;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawMeasureLabel(
  context: CanvasRenderingContext2D,
  text: string,
  y: number,
  canvasHeight: number,
): void {
  const centerInset = MEASURE_LABEL_EDGE_PADDING_PX + MEASURE_LABEL_HEIGHT_PX / 2;
  const center = Math.min(
    Math.max(centerInset, y),
    Math.max(centerInset, canvasHeight - centerInset),
  );
  const labelTop = Math.round(center - MEASURE_LABEL_HEIGHT_PX / 2);
  const labelWidth = Math.max(26, Math.ceil(context.measureText(text).width) + 14);

  roundedRect(context, 8, labelTop, labelWidth, MEASURE_LABEL_HEIGHT_PX, 10);
  context.fillStyle = "rgb(10 13 18 / 74%)";
  context.fill();
  context.strokeStyle = "rgb(255 255 255 / 12%)";
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = "rgb(216 225 235 / 90%)";
  context.fillText(text, 8 + labelWidth / 2, labelTop + MEASURE_LABEL_HEIGHT_PX / 2 + 0.5);
}

function drawRiver(
  canvas: HTMLCanvasElement,
  visualScore: VisualScore,
  positionBeats: number,
  lookAheadBeats: number,
  handMode: HandMode,
  showMeasureLines: boolean,
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const { height, width } = canvasSize(canvas);
  if (height <= 0 || width <= 0) {
    return;
  }

  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  const windowStart = positionBeats - LOOK_BEHIND_BEATS;
  const windowEnd = positionBeats + lookAheadBeats;

  if (showMeasureLines) {
    const measureStartIndex = lowerBoundByStart(visualScore.measures, windowStart);
    const measureEndIndex = upperBoundByStart(visualScore.measures, windowEnd);
    context.font = "600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (let index = measureStartIndex; index < measureEndIndex; index += 1) {
      const measure = visualScore.measures[index];
      const y = yUnitToPx(yForBeat(measure.startBeat, positionBeats, lookAheadBeats), height);
      context.globalAlpha = 1;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.strokeStyle = "rgb(255 255 255 / 22%)";
      context.lineWidth = 1;
      context.stroke();
      drawMeasureLabel(context, measure.number, y, height);
    }
  }

  for (const segment of visualScore.glissandoSegments) {
    if (segment.endBeat < windowStart || segment.startBeat > windowEnd) {
      continue;
    }

    const selected = includeVisual(handMode, segment.hand);
    context.globalAlpha = selected ? 1 : 0.18;
    context.beginPath();
    context.setLineDash([4, 3]);
    context.moveTo(
      percentToPx(segment.startX, width),
      yUnitToPx(yForBeat(segment.startBeat, positionBeats, lookAheadBeats), height),
    );
    context.lineTo(
      percentToPx(segment.endX, width),
      yUnitToPx(yForBeat(segment.endBeat, positionBeats, lookAheadBeats), height),
    );
    context.strokeStyle = GLISSANDO_COLORS[segment.hand as Hand] ?? GLISSANDO_COLORS.unknown;
    context.lineWidth = 2.6;
    context.stroke();
    context.setLineDash([]);
  }

  const startIndex = lowerBoundByStart(
    visualScore.notes,
    windowStart - visualScore.maxDurationBeats,
  );
  const endIndex = upperBoundByStart(visualScore.notes, windowEnd);

  for (let index = startIndex; index < endIndex; index += 1) {
    const visualNote = visualScore.notes[index];
    if (visualNote.endBeat < windowStart) {
      continue;
    }

    const { layout, note } = visualNote;
    const startY = yUnitToPx(yForBeat(visualNote.startBeat, positionBeats, lookAheadBeats), height);
    const endY = yUnitToPx(
      yForBeat(visualNote.startBeat + visualNote.durationBeats, positionBeats, lookAheadBeats),
      height,
    );
    const top = Math.min(startY, endY);
    const bottom = Math.max(startY, endY);
    const noteHeight = Math.max((MIN_NOTE_HEIGHT_Y / VIEWBOX_HEIGHT) * height, bottom - top);
    const x = percentToPx(visualNote.x, width);
    const noteWidth = percentToPx(layout.noteWidthPercent, width);
    const radius = layout.black ? 3 : 5;
    const colors = NOTE_COLORS[note.hand];
    const selected = includeVisual(handMode, note.hand);

    context.globalAlpha = selected ? 1 : 0.18;
    roundedRect(context, x, top, noteWidth, noteHeight, radius);
    context.fillStyle = layout.black ? colors.black : colors.white;
    context.fill();
    context.strokeStyle = "#060910";
    context.lineWidth = 1.45;
    context.stroke();

    context.beginPath();
    context.moveTo(x, startY);
    context.lineTo(x + noteWidth, startY);
    context.strokeStyle = "#05070c";
    context.lineWidth = 4.6;
    context.stroke();

    context.globalAlpha = selected ? 0.78 : 0.14;
    context.beginPath();
    context.moveTo(x, endY);
    context.lineTo(x + noteWidth, endY);
    context.lineWidth = 3.2;
    context.stroke();
  }

  context.globalAlpha = 1;
  const strikeY = yUnitToPx(STRIKE_Y, height);
  context.beginPath();
  context.moveTo(0, strikeY);
  context.lineTo(width, strikeY);
  context.strokeStyle = "rgb(255 255 255 / 62%)";
  context.lineWidth = 2;
  context.stroke();
}

export const NoteRiver = memo(function NoteRiver({
  score,
  handMode,
  riverZoom,
  showMeasureLines,
  showNoteNames,
}: NoteRiverProps) {
  const lookAheadBeats = BASE_LOOK_AHEAD_BEATS / Math.max(0.5, riverZoom);
  const [activeLabels, setActiveLabels] = useState<NoteEvent[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualScoreRef = useRef<VisualScore>(EMPTY_VISUAL_SCORE);
  const handModeRef = useRef(handMode);
  const showMeasureLinesRef = useRef(showMeasureLines);
  const showNoteNamesRef = useRef(showNoteNames);
  const lookAheadBeatsRef = useRef(lookAheadBeats);
  const latestPositionBeatRef = useRef(currentDisplayBeat());
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
          durationBeats,
          endBeat: startBeat + durationBeats,
          layout,
          note,
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
  showMeasureLinesRef.current = showMeasureLines;
  showNoteNamesRef.current = showNoteNames;
  lookAheadBeatsRef.current = lookAheadBeats;

  const paint = useCallback((positionBeats: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawRiver(
      canvas,
      visualScoreRef.current,
      positionBeats,
      lookAheadBeatsRef.current,
      handModeRef.current,
      showMeasureLinesRef.current,
    );
  }, []);

  const updateActiveLabels = useCallback((positionBeats: number) => {
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
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const updateCanvasSize = () => {
      resizeCanvas(canvas);
      paint(latestPositionBeatRef.current);
    };
    updateCanvasSize();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [paint]);

  useEffect(() => {
    const nextBeat = currentDisplayBeat();
    latestPositionBeatRef.current = nextBeat;
    labelSignatureRef.current = "";
    paint(nextBeat);
    updateActiveLabels(nextBeat);
  }, [paint, score, updateActiveLabels]);

  useEffect(() => {
    paint(latestPositionBeatRef.current);
    updateActiveLabels(latestPositionBeatRef.current);
  }, [handMode, lookAheadBeats, paint, showMeasureLines, updateActiveLabels, visualScore]);

  useEffect(() => {
    const update = () => {
      const positionBeats = currentDisplayBeat();
      latestPositionBeatRef.current = positionBeats;
      paint(positionBeats);
      updateActiveLabels(positionBeats);
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
  }, [paint, updateActiveLabels]);

  useEffect(() => {
    if (!showNoteNames) {
      labelSignatureRef.current = "";
      setActiveLabels([]);
      return;
    }

    updateActiveLabels(latestPositionBeatRef.current);
  }, [showNoteNames, updateActiveLabels]);

  if (!score) {
    return (
      <div className="empty-state">
        <p>Load MusicXML to start practicing.</p>
      </div>
    );
  }

  return (
    <div className="note-river" aria-label="Falling notes">
      <canvas aria-hidden="true" ref={canvasRef} />
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
