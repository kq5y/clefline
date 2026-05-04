import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pianoKeyLayoutForMidiInRange, type PianoKeyLayout } from "../lib/pianoLayout";
import {
  createPlaybackDisplayAnchor,
  displayPlaybackBeat,
  type PlaybackDisplayAnchor,
} from "../lib/playbackDisplayPosition";
import {
  minimumPositionBeats,
  usePracticeStore,
  type HandMode,
  type RiverRange,
} from "../store/practiceStore";
import type { Hand, NoteEvent, PlaybackEvent, ScoreModel } from "../lib/musicxml";

type NoteRiverProps = {
  score?: ScoreModel;
  playbackEvents: PlaybackEvent[];
  handMode: HandMode;
  riverZoom: number;
  riverRange: RiverRange;
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
const MEASURE_LABEL_HEIGHT_PX = 20;
const MEASURE_LABEL_EDGE_PADDING_PX = 6;
const NOTE_LABEL_UPDATE_MS = 60;
const MAX_CANVAS_PIXEL_RATIO = 1.5;

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
  return usePracticeStore.getState().positionBeats;
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
  const parent = canvas.parentElement;

  return {
    height: parent?.clientHeight ?? canvas.clientHeight,
    width: parent?.clientWidth ?? canvas.clientWidth,
  };
}

function bufferPxFor(height: number, lookAheadBeats: number): number {
  return Math.ceil(((RENDER_BUFFER_BEATS / lookAheadBeats) * STRIKE_Y * height) / VIEWBOX_HEIGHT);
}

function translatePxFor(
  positionBeats: number,
  anchorBeat: number,
  lookAheadBeats: number,
  height: number,
): number {
  return (((positionBeats - anchorBeat) / lookAheadBeats) * STRIKE_Y * height) / VIEWBOX_HEIGHT;
}

function resizeCanvas(canvas: HTMLCanvasElement, lookAheadBeats: number): boolean {
  const { height, width } = canvasSize(canvas);
  const bufferPx = bufferPxFor(height, lookAheadBeats);
  const layerHeight = height + bufferPx * 2;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_PIXEL_RATIO);
  const nextWidth = Math.max(1, Math.round(width * pixelRatio));
  const nextHeight = Math.max(1, Math.round(layerHeight * pixelRatio));
  const changed = canvas.width !== nextWidth || canvas.height !== nextHeight;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${layerHeight}px`;
  canvas.style.top = `${-bufferPx}px`;

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
  layerHeight: number,
): void {
  const centerInset = MEASURE_LABEL_EDGE_PADDING_PX + MEASURE_LABEL_HEIGHT_PX / 2;
  const center = Math.min(
    Math.max(centerInset, y),
    Math.max(centerInset, layerHeight - centerInset),
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

const OCTAVE_C_MIDIS = [24, 36, 48, 60, 72, 84, 96];

function drawRiverLayer(
  canvas: HTMLCanvasElement,
  visualScore: VisualScore,
  anchorBeat: number,
  lookAheadBeats: number,
  handMode: HandMode,
  riverRange: RiverRange,
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

  resizeCanvas(canvas, lookAheadBeats);
  const bufferPx = bufferPxFor(height, lookAheadBeats);
  const layerHeight = height + bufferPx * 2;

  context.clearRect(0, 0, width, layerHeight);
  context.lineCap = "round";
  context.lineJoin = "round";

  context.globalAlpha = 1;
  context.strokeStyle = "rgb(255 255 255 / 12%)";
  context.lineWidth = 1;
  for (const cMidi of OCTAVE_C_MIDIS) {
    if (cMidi < riverRange.minMidi || cMidi > riverRange.maxMidi) {
      continue;
    }
    const layout = pianoKeyLayoutForMidiInRange(cMidi, riverRange.minMidi, riverRange.maxMidi);
    const x = percentToPx(layout.centerPercent - layout.keyWidthPercent / 2, width);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, layerHeight);
    context.stroke();
  }

  const windowStart = anchorBeat - LOOK_BEHIND_BEATS - RENDER_BUFFER_BEATS;
  const windowEnd = anchorBeat + lookAheadBeats + RENDER_BUFFER_BEATS;

  if (showMeasureLines) {
    const measureStartIndex = lowerBoundByStart(visualScore.measures, windowStart);
    const measureEndIndex = upperBoundByStart(visualScore.measures, windowEnd);
    context.font = "600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (let index = measureStartIndex; index < measureEndIndex; index += 1) {
      const measure = visualScore.measures[index];
      const y =
        yUnitToPx(yForBeat(measure.startBeat, anchorBeat, lookAheadBeats), height) + bufferPx;
      context.globalAlpha = 1;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.strokeStyle = "rgb(255 255 255 / 22%)";
      context.lineWidth = 1;
      context.stroke();
      drawMeasureLabel(context, measure.number, y, layerHeight);
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
      yUnitToPx(yForBeat(segment.startBeat, anchorBeat, lookAheadBeats), height) + bufferPx,
    );
    context.lineTo(
      percentToPx(segment.endX, width),
      yUnitToPx(yForBeat(segment.endBeat, anchorBeat, lookAheadBeats), height) + bufferPx,
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
    const startY =
      yUnitToPx(yForBeat(visualNote.startBeat, anchorBeat, lookAheadBeats), height) + bufferPx;
    const endY =
      yUnitToPx(
        yForBeat(visualNote.startBeat + visualNote.durationBeats, anchorBeat, lookAheadBeats),
        height,
      ) + bufferPx;
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
}

export const NoteRiver = memo(function NoteRiver({
  score,
  playbackEvents,
  handMode,
  riverZoom,
  riverRange,
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
  const anchorBeatRef = useRef(latestPositionBeatRef.current);
  const labelSignatureRef = useRef("");
  const lastLabelUpdateTimeRef = useRef(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const playbackAnchorRef = useRef<PlaybackDisplayAnchor>(createPlaybackDisplayAnchor());
  const visualScore = useMemo<VisualScore>(() => {
    if (!score || playbackEvents.length === 0) {
      return EMPTY_VISUAL_SCORE;
    }

    let maxDurationBeats = 0;
    const notes: VisualNote[] = [];

    for (const event of playbackEvents) {
      const graceOffset = event.notes.some((note) => note.isGrace)
        ? event.notes.some(isLongGrace)
          ? 0.32
          : 0.14
        : 0;

      for (const note of event.notes) {
        if (note.tieStop) {
          continue;
        }

        const startBeat = event.absoluteBeat + graceOffset;
        const durationBeats = event.durationBeats;
        const layout = pianoKeyLayoutForMidiInRange(
          note.midi,
          riverRange.minMidi,
          riverRange.maxMidi,
        );
        maxDurationBeats = Math.max(maxDurationBeats, durationBeats);

        notes.push({
          durationBeats,
          endBeat: startBeat + durationBeats,
          layout,
          note,
          startBeat,
          x: layout.centerPercent - layout.noteWidthPercent / 2,
        });
      }
    }

    notes.sort(
      (first, second) => first.startBeat - second.startBeat || first.note.midi - second.note.midi,
    );

    const measures: MeasureMarker[] = [
      { index: -1, number: "0", startBeat: minimumPositionBeats(score) },
    ];
    let currentAbsoluteBeat = 0;
    for (const measure of score.measures) {
      measures.push({
        index: measure.index,
        number: measure.number,
        startBeat: currentAbsoluteBeat + measure.startBeat,
      });
      if (measure.repeatEnd) {
        currentAbsoluteBeat += measure.startBeat + measure.durationBeats;
      }
    }
    measures.sort((first, second) => first.startBeat - second.startBeat);

    // TODO: glissando segments need absoluteBeat mapping
    const glissandoSegments: VisualGlissandoSegment[] = [];

    return { glissandoSegments, maxDurationBeats, measures, notes };
  }, [score, playbackEvents, riverRange]);

  visualScoreRef.current = visualScore;
  handModeRef.current = handMode;
  showMeasureLinesRef.current = showMeasureLines;
  showNoteNamesRef.current = showNoteNames;
  lookAheadBeatsRef.current = lookAheadBeats;
  const riverRangeRef = useRef(riverRange);
  riverRangeRef.current = riverRange;

  const redrawLayer = useCallback((anchorBeat: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawRiverLayer(
      canvas,
      visualScoreRef.current,
      anchorBeat,
      lookAheadBeatsRef.current,
      handModeRef.current,
      riverRangeRef.current,
      showMeasureLinesRef.current,
    );
  }, []);

  const updateMotion = useCallback((positionBeats: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const { height } = canvasSize(canvas);
    const translateY = translatePxFor(
      positionBeats,
      anchorBeatRef.current,
      lookAheadBeatsRef.current,
      height,
    );
    canvas.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0)`;
  }, []);

  const reanchor = useCallback(
    (positionBeats: number) => {
      anchorBeatRef.current = positionBeats;
      redrawLayer(positionBeats);
      updateMotion(positionBeats);
    },
    [redrawLayer, updateMotion],
  );

  const updateActiveLabels = useCallback((positionBeats: number, frameTime?: number) => {
    if (!showNoteNamesRef.current) {
      return;
    }
    if (
      frameTime !== undefined &&
      frameTime - lastLabelUpdateTimeRef.current < NOTE_LABEL_UPDATE_MS
    ) {
      return;
    }
    lastLabelUpdateTimeRef.current = frameTime ?? window.performance.now();

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
      resizeCanvas(canvas, lookAheadBeatsRef.current);
      redrawLayer(anchorBeatRef.current);
      updateMotion(latestPositionBeatRef.current);
    };
    updateCanvasSize();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [redrawLayer, updateMotion]);

  useEffect(() => {
    const nextBeat = currentDisplayBeat();
    latestPositionBeatRef.current = nextBeat;
    anchorBeatRef.current = nextBeat;
    labelSignatureRef.current = "";
    lastLabelUpdateTimeRef.current = 0;
    redrawLayer(nextBeat);
    updateMotion(nextBeat);
    updateActiveLabels(nextBeat);
  }, [redrawLayer, score, updateActiveLabels, updateMotion]);

  useEffect(() => {
    reanchor(latestPositionBeatRef.current);
    updateActiveLabels(latestPositionBeatRef.current);
  }, [handMode, lookAheadBeats, reanchor, riverRange, showMeasureLines, updateActiveLabels, visualScore]);

  useEffect(() => {
    if (!score) {
      return undefined;
    }

    const update = (frameTime: number) => {
      const state = usePracticeStore.getState();
      const positionBeats = displayPlaybackBeat(state, playbackAnchorRef.current, frameTime);
      latestPositionBeatRef.current = positionBeats;
      if (
        positionBeats < anchorBeatRef.current - REANCHOR_BEHIND_BEATS ||
        positionBeats > anchorBeatRef.current + REANCHOR_AHEAD_BEATS
      ) {
        reanchor(positionBeats);
      } else {
        updateMotion(positionBeats);
      }
      updateActiveLabels(positionBeats, frameTime);
    };

    const frame = (frameTime: number) => {
      update(frameTime);
      animationFrameRef.current = window.requestAnimationFrame(frame);
    };
    animationFrameRef.current = window.requestAnimationFrame(frame);

    return () => {
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, [reanchor, score, updateActiveLabels, updateMotion]);

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
      <div className="strike-line-canvas" aria-hidden="true" />
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
