import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay as OSMDInstance } from "opensheetmusicdisplay";
import { sanitizeScoreDisplayXml } from "../lib/musicxml/displayXml";
import { buildGlissandoSegments } from "../lib/musicxml/glissando";
import { loadOsmd } from "../lib/osmd";
import { sourceBeatAt, usePracticeStore } from "../store/practiceStore";
import type { ScoreModel } from "../lib/musicxml";

type ScoreViewProps = {
  active: boolean;
  score?: ScoreModel;
};

type ColorableGraphicalNote = {
  getNoteheadSVGs?: () => HTMLElement[];
  getSVGGElement?: () => SVGGElement;
  setColor: (color: string, options: Record<string, boolean>) => void;
  sourceNote?: {
    halfTone?: number;
  };
  vfnote?: [unknown, number];
  vfnoteIndex?: number;
};

type ScorePosition = {
  beat: number;
  x: number;
  notes: ColorableGraphicalNote[];
};

type NoteHeadBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ScoreGlissandoOverlay = {
  id: string;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  hand: string;
};

const OSMD_BEAT_FACTOR = 4;
const OSMD_HALFTONE_TO_MIDI_OFFSET = 12;
const MAX_CURSOR_STEPS = 12_000;

function currentMeasure(score: ScoreModel, positionBeats: number): string {
  if (positionBeats < 0) {
    return "0";
  }

  let low = 0;
  let high = score.measures.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (score.measures[middle].startBeat <= positionBeats) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return score.measures[match]?.number ?? score.measures[0]?.number ?? "1";
}

function visibleCursorElement(view: HTMLDivElement): HTMLElement | undefined {
  const cursor =
    (Array.from(view.querySelectorAll("img[id*=cursor]")) as HTMLElement[]).find((element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        box.width > 0 &&
        box.height > 0
      );
    }) ?? undefined;

  return cursor;
}

function cursorXInScroll(view: HTMLDivElement): number | undefined {
  const cursor = visibleCursorElement(view);
  if (!cursor) {
    return undefined;
  }

  const cursorBox = cursor.getBoundingClientRect();
  const viewBox = view.getBoundingClientRect();

  return cursorBox.left - viewBox.left + view.scrollLeft;
}

function xForGraphicalNotes(
  notes: ColorableGraphicalNote[],
  view: HTMLDivElement,
): number | undefined {
  const boxes = notes
    .map((note) => noteHeadBoxInView(note, view))
    .filter((box): box is NoteHeadBox => Boolean(box));
  if (boxes.length === 0) {
    return undefined;
  }

  return boxes.reduce((left, box) => Math.min(left, box.x), Number.POSITIVE_INFINITY);
}

function collectScorePosition(
  cursors: OSMDInstance["cursors"],
  primaryCursor: OSMDInstance["cursor"],
  view: HTMLDivElement,
  positions: ScorePosition[],
  seenBeats: Set<string>,
): void {
  const beat = primaryCursor.Iterator.CurrentSourceTimestamp.RealValue * OSMD_BEAT_FACTOR;
  const beatKey = beat.toFixed(5);
  const notes = Array.from(
    new Set(cursors.flatMap((cursor) => cursor.GNotesUnderCursor() as ColorableGraphicalNote[])),
  );
  const x = xForGraphicalNotes(notes, view) ?? cursorXInScroll(view);
  if (x === undefined || seenBeats.has(beatKey)) {
    return;
  }

  seenBeats.add(beatKey);
  positions.push({ beat, x, notes });
}

function schedulePositionBuild(callback: (deadline?: IdleDeadline) => void): () => void {
  const idleWindow = window;
  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const id = idleWindow.requestIdleCallback(callback, { timeout: 700 });

    return () => idleWindow.cancelIdleCallback(id);
  }

  const id = window.setTimeout(() => callback(), 80);

  return () => window.clearTimeout(id);
}

function startScorePositionBuild(
  osmd: OSMDInstance,
  view: HTMLDivElement,
  onComplete: (positions: ScorePosition[]) => void,
): () => void {
  const cursors = osmd.cursors.length > 0 ? osmd.cursors : [osmd.cursor];
  const primaryCursor = cursors[0];
  const positions: ScorePosition[] = [];
  const seenBeats = new Set<string>();
  let cancelled = false;
  let steps = 0;
  let cancelSchedule: (() => void) | undefined;

  view.scrollLeft = 0;
  for (const cursor of cursors) {
    cursor.reset();
    cursor.hide();
  }

  const step = (deadline?: IdleDeadline) => {
    if (cancelled) {
      return;
    }

    let processed = 0;
    while (steps < MAX_CURSOR_STEPS && !primaryCursor.Iterator.EndReached) {
      if (deadline && processed > 0 && deadline.timeRemaining() < 4) {
        break;
      }
      if (!deadline && processed >= 80) {
        break;
      }

      collectScorePosition(cursors, primaryCursor, view, positions, seenBeats);
      for (const cursor of cursors) {
        cursor.next();
      }
      processed += 1;
      steps += 1;
    }

    if (steps >= MAX_CURSOR_STEPS || primaryCursor.Iterator.EndReached) {
      for (const cursor of cursors) {
        cursor.hide();
      }
      onComplete(positions);
      return;
    }

    cancelSchedule = schedulePositionBuild(step);
  };

  cancelSchedule = schedulePositionBuild(step);

  return () => {
    cancelled = true;
    cancelSchedule?.();
    for (const cursor of cursors) {
      cursor.hide();
    }
  };
}

function positionIndexForBeat(positions: ScorePosition[], positionBeats: number): number {
  let low = 0;
  let high = positions.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (positions[middle].beat <= positionBeats) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match;
}

function xForBeat(
  positions: ScorePosition[],
  positionBeats: number,
): { index: number; x: number } | undefined {
  if (positions.length === 0) {
    return undefined;
  }

  const index = positionIndexForBeat(positions, positionBeats);
  if (index < 0) {
    return { index: 0, x: positions[0].x };
  }
  const current = positions[index];
  const next = positions[index + 1];
  if (!next) {
    return { index, x: current.x };
  }

  const progress = Math.min(
    1,
    Math.max(0, (positionBeats - current.beat) / Math.max(0.001, next.beat - current.beat)),
  );

  return { index, x: current.x + (next.x - current.x) * progress };
}

function colorScoreNotes(notes: ColorableGraphicalNote[], color: string): void {
  const options = {
    applyToBeams: true,
    applyToFlag: true,
    applyToLedgerLines: true,
    applyToModifiers: false,
    applyToNoteheads: true,
    applyToStem: true,
  };

  for (const note of notes) {
    try {
      note.setColor(color, options);
    } catch {
      // OSMD can invalidate graphical note references during teardown.
    }
  }
}

function noteHeadElement(note: ColorableGraphicalNote): HTMLElement | undefined {
  try {
    const noteheads = note.getNoteheadSVGs?.() ?? [];
    const index = Math.max(
      0,
      Math.min(noteheads.length - 1, note.vfnoteIndex ?? note.vfnote?.[1] ?? 0),
    );

    return noteheads[index] ?? note.getSVGGElement?.();
  } catch {
    return undefined;
  }
}

function noteHeadBoxInView(
  note: ColorableGraphicalNote,
  view: HTMLDivElement,
): NoteHeadBox | undefined {
  const element = noteHeadElement(note);
  if (!element) {
    return undefined;
  }

  const box = element.getBoundingClientRect();
  const viewBox = view.getBoundingClientRect();

  return {
    x: box.left - viewBox.left + view.scrollLeft,
    y: box.top - viewBox.top + view.scrollTop,
    width: box.width,
    height: box.height,
  };
}

function graphicalMidi(note: ColorableGraphicalNote): number | undefined {
  return typeof note.sourceNote?.halfTone === "number"
    ? note.sourceNote.halfTone + OSMD_HALFTONE_TO_MIDI_OFFSET
    : undefined;
}

function findGraphicalNote(
  positions: ScorePosition[],
  startBeat: number,
  midi: number,
): ColorableGraphicalNote | undefined {
  const index = positionIndexForBeat(positions, startBeat);
  const nearby = [index - 1, index, index + 1].filter(
    (candidate) => candidate >= 0 && candidate < positions.length,
  );

  for (const candidate of nearby) {
    const position = positions[candidate];
    if (Math.abs(position.beat - startBeat) > 0.001) {
      continue;
    }

    const match = position.notes.find((graphicalNote) => graphicalMidi(graphicalNote) === midi);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function buildScoreGlissandoOverlays(
  score: ScoreModel,
  positions: ScorePosition[],
  view: HTMLDivElement,
): ScoreGlissandoOverlay[] {
  if (positions.length === 0) {
    return [];
  }

  return buildGlissandoSegments(score.notes).flatMap((segment) => {
    const startNote = findGraphicalNote(positions, segment.startBeat, segment.startMidi);
    const endNote = findGraphicalNote(positions, segment.endBeat, segment.endMidi);
    if (!startNote || !endNote) {
      return [];
    }

    const startBox = noteHeadBoxInView(startNote, view);
    const endBox = noteHeadBoxInView(endNote, view);
    if (!startBox || !endBox) {
      return [];
    }

    const startCenterX = startBox.x + startBox.width / 2;
    const endCenterX = endBox.x + endBox.width / 2;
    const leftToRight = endCenterX >= startCenterX;

    return [
      {
        id: segment.id,
        x1: leftToRight ? startBox.x + startBox.width : startBox.x,
        x2: leftToRight ? endBox.x : endBox.x + endBox.width,
        y1: startBox.y + startBox.height / 2,
        y2: endBox.y + endBox.height / 2,
        hand: segment.hand,
      },
    ];
  });
}

function renderGlissandoOverlays(
  overlay: SVGSVGElement | null,
  view: HTMLDivElement | null,
  segments: ScoreGlissandoOverlay[],
): void {
  if (!overlay || !view) {
    return;
  }

  overlay.setAttribute("width", `${view.scrollWidth}`);
  overlay.setAttribute("height", `${view.scrollHeight}`);
  overlay.setAttribute("viewBox", `0 0 ${view.scrollWidth} ${view.scrollHeight}`);
  overlay.replaceChildren();

  for (const segment of segments) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", `score-glissando-line ${segment.hand}`);
    line.setAttribute("x1", `${segment.x1}`);
    line.setAttribute("x2", `${segment.x2}`);
    line.setAttribute("y1", `${segment.y1}`);
    line.setAttribute("y2", `${segment.y2}`);
    overlay.append(line);
  }
}

export const ScoreView = memo(function ScoreView({ active, score }: ScoreViewProps) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const glissandoOverlayRef = useRef<SVGSVGElement | null>(null);
  const osmdRef = useRef<OSMDInstance | null>(null);
  const scorePositionsRef = useRef<ScorePosition[]>([]);
  const highlightedNotesRef = useRef<ColorableGraphicalNote[]>([]);
  const highlightedIndexRef = useRef(-1);
  const latestMeasureRef = useRef<string | undefined>(undefined);
  const pendingPositionRef = useRef<number | undefined>(undefined);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>();

  const updateScorePosition = useCallback(
    (positionBeats: number) => {
      const view = viewRef.current;
      if (!view || !score || score.totalBeats <= 0) {
        return;
      }

      if (measureRef.current) {
        const nextMeasure = currentMeasure(score, positionBeats);
        if (nextMeasure !== latestMeasureRef.current) {
          latestMeasureRef.current = nextMeasure;
          measureRef.current.textContent = `Measure ${nextMeasure}`;
        }
      }

      const scorePositions = scorePositionsRef.current;
      const currentPosition = xForBeat(scorePositions, positionBeats);
      const fallbackX = (positionBeats / score.totalBeats) * view.scrollWidth;
      const maxScroll = Math.max(0, view.scrollWidth - view.clientWidth);
      const targetScroll = Math.min(
        maxScroll,
        Math.max(0, (currentPosition?.x ?? fallbackX) - view.clientWidth * 0.42),
      );
      if (Math.abs(view.scrollLeft - targetScroll) > 0.25) {
        view.scrollLeft = targetScroll;
      }

      const nextHighlightIndex = positionBeats < 0 ? -1 : (currentPosition?.index ?? -1);
      if (nextHighlightIndex !== highlightedIndexRef.current) {
        colorScoreNotes(highlightedNotesRef.current, "#000000");
        const nextNotes =
          nextHighlightIndex >= 0 ? (scorePositions[nextHighlightIndex]?.notes ?? []) : [];
        highlightedNotesRef.current = nextNotes;
        highlightedIndexRef.current = nextHighlightIndex;
        if (nextNotes.length > 0) {
          colorScoreNotes(nextNotes, "#e05842");
        }
      }
    },
    [score],
  );
  const scheduleScorePosition = useCallback(
    (positionBeats: number) => {
      pendingPositionRef.current = positionBeats;
      if (animationFrameRef.current !== undefined) {
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = undefined;
        const nextPosition = pendingPositionRef.current;
        pendingPositionRef.current = undefined;
        if (nextPosition !== undefined) {
          updateScorePosition(nextPosition);
        }
      });
    },
    [updateScorePosition],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !score) {
      return undefined;
    }

    const glissandoOverlay = glissandoOverlayRef.current;
    let cancelled = false;
    let cancelPositionBuild: (() => void) | undefined;
    container.innerHTML = "";
    glissandoOverlay?.replaceChildren();
    osmdRef.current = null;
    scorePositionsRef.current = [];
    latestMeasureRef.current = undefined;
    setError(undefined);

    void loadOsmd()
      .then(async ({ OpenSheetMusicDisplay }) => {
        const osmd = new OpenSheetMusicDisplay(container, {
          backend: "svg",
          autoResize: false,
          disableCursor: false,
          followCursor: false,
          cursorsOptions: [
            { type: 1, color: "#e05842", alpha: 0.95, follow: false },
            { type: 0, color: "#ffd166", alpha: 0.34, follow: false },
          ],
          drawComposer: false,
          drawTitle: false,
          drawingParameters: "compacttight",
          pageFormat: "Endless",
          renderSingleHorizontalStaffline: true,
        });
        osmd.EngravingRules.RenderSingleHorizontalStaffline = true;
        osmd.EngravingRules.RenderGlissandi = false;
        osmd.EngravingRules.RehearsalMarkYOffsetDefault = 20;
        osmd.EngravingRules.RehearsalMarkYOffsetAddedForRehearsalMarks = 0;
        osmd.EngravingRules.RehearsalMarkFontSize = 11;
        osmd.Zoom = 0.92;
        await osmd.load(sanitizeScoreDisplayXml(score.rawXml));
        if (!cancelled) {
          osmd.render();
          osmd.enableOrDisableCursors(true);
          for (const cursor of osmd.cursors.length > 0 ? osmd.cursors : [osmd.cursor]) {
            cursor.reset();
            cursor.hide();
          }
          osmdRef.current = osmd;
          const currentState = usePracticeStore.getState();
          updateScorePosition(
            sourceBeatAt(currentState.playbackEvents, currentState.positionBeats),
          );
          const view = viewRef.current;
          if (!view) {
            return;
          }

          cancelPositionBuild = startScorePositionBuild(osmd, view, (positions) => {
            if (cancelled || !viewRef.current) {
              return;
            }

            scorePositionsRef.current = positions;
            renderGlissandoOverlays(
              glissandoOverlayRef.current,
              viewRef.current,
              buildScoreGlissandoOverlays(score, positions, viewRef.current),
            );
            const latestState = usePracticeStore.getState();
            updateScorePosition(
              sourceBeatAt(latestState.playbackEvents, latestState.positionBeats),
            );
          });
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to render score.");
      });

    return () => {
      cancelled = true;
      cancelPositionBuild?.();
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      pendingPositionRef.current = undefined;
      colorScoreNotes(highlightedNotesRef.current, "#000000");
      highlightedNotesRef.current = [];
      highlightedIndexRef.current = -1;
      latestMeasureRef.current = undefined;
      scorePositionsRef.current = [];
      glissandoOverlay?.replaceChildren();
      osmdRef.current?.clear();
      osmdRef.current = null;
      container.innerHTML = "";
    };
  }, [score, updateScorePosition]);

  useEffect(() => {
    if (!score || !active) {
      return undefined;
    }

    const currentState = usePracticeStore.getState();
    scheduleScorePosition(sourceBeatAt(currentState.playbackEvents, currentState.positionBeats));
    const unsubscribe = usePracticeStore.subscribe((nextState, previousState) => {
      if (nextState.positionBeats !== previousState.positionBeats) {
        scheduleScorePosition(sourceBeatAt(nextState.playbackEvents, nextState.positionBeats));
      }
    });

    return () => {
      unsubscribe();
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      pendingPositionRef.current = undefined;
    };
  }, [active, scheduleScorePosition, score]);

  if (!score) {
    return (
      <div className="empty-state">
        <p>Load MusicXML to view notation.</p>
      </div>
    );
  }

  return (
    <div className="score-view">
      <div className="score-playback-line" aria-hidden="true" />
      <div className="score-current-measure" ref={measureRef}>
        Measure{" "}
        {currentMeasure(
          score,
          sourceBeatAt(
            usePracticeStore.getState().playbackEvents,
            usePracticeStore.getState().positionBeats,
          ),
        )}
      </div>
      {error ? <div className="score-error">{error}</div> : null}
      <div className="score-scroll" ref={viewRef}>
        <svg className="score-glissando-overlay" ref={glissandoOverlayRef} aria-hidden="true" />
        <div className="score-canvas" ref={containerRef} />
      </div>
    </div>
  );
});
