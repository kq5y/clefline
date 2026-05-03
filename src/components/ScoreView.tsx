import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay as OSMDInstance } from "opensheetmusicdisplay";
import { sanitizeScoreDisplayXml } from "../lib/musicxml/displayXml";
import { loadOsmd } from "../lib/osmd";
import { usePracticeStore } from "../store/practiceStore";
import type { ScoreModel } from "../lib/musicxml";

type ScoreViewProps = {
  active: boolean;
  score?: ScoreModel;
};

type ColorableGraphicalNote = {
  setColor: (color: string, options: Record<string, boolean>) => void;
};

type ScorePosition = {
  beat: number;
  x: number;
  notes: ColorableGraphicalNote[];
};

const OSMD_BEAT_FACTOR = 4;
const MAX_CURSOR_STEPS = 12_000;

function currentMeasure(score: ScoreModel, positionBeats: number): string {
  if (positionBeats < 0) {
    return "0";
  }

  const measure = score.measures.findLast((item) => item.startBeat <= positionBeats);

  return measure?.number ?? score.measures[0]?.number ?? "1";
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

function collectScorePosition(
  cursors: OSMDInstance["cursors"],
  primaryCursor: OSMDInstance["cursor"],
  view: HTMLDivElement,
  positions: ScorePosition[],
  seenBeats: Set<string>,
): void {
  const beat = primaryCursor.Iterator.CurrentSourceTimestamp.RealValue * OSMD_BEAT_FACTOR;
  const beatKey = beat.toFixed(5);
  const x = cursorXInScroll(view);
  if (x === undefined || seenBeats.has(beatKey)) {
    return;
  }

  seenBeats.add(beatKey);
  const notes = Array.from(
    new Set(cursors.flatMap((cursor) => cursor.GNotesUnderCursor() as ColorableGraphicalNote[])),
  );
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
    cursor.show();
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

export const ScoreView = memo(function ScoreView({ active, score }: ScoreViewProps) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OSMDInstance | null>(null);
  const scorePositionsRef = useRef<ScorePosition[]>([]);
  const highlightedNotesRef = useRef<ColorableGraphicalNote[]>([]);
  const highlightedIndexRef = useRef(-1);
  const [error, setError] = useState<string | undefined>();

  const updateScorePosition = useCallback(
    (positionBeats: number) => {
      const view = viewRef.current;
      if (!view || !score || score.totalBeats <= 0) {
        return;
      }

      if (measureRef.current) {
        measureRef.current.textContent = `Measure ${currentMeasure(score, positionBeats)}`;
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !score) {
      return undefined;
    }

    let cancelled = false;
    let cancelPositionBuild: (() => void) | undefined;
    container.innerHTML = "";
    osmdRef.current = null;
    scorePositionsRef.current = [];
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
        osmd.Zoom = 0.92;
        await osmd.load(sanitizeScoreDisplayXml(score.rawXml));
        if (!cancelled) {
          osmd.render();
          osmd.enableOrDisableCursors(true);
          for (const cursor of osmd.cursors.length > 0 ? osmd.cursors : [osmd.cursor]) {
            cursor.reset();
            cursor.show();
          }
          osmdRef.current = osmd;
          updateScorePosition(usePracticeStore.getState().positionBeats);
          const view = viewRef.current;
          if (!view) {
            return;
          }

          cancelPositionBuild = startScorePositionBuild(osmd, view, (positions) => {
            if (cancelled || !viewRef.current) {
              return;
            }

            scorePositionsRef.current = positions;
            updateScorePosition(usePracticeStore.getState().positionBeats);
          });
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to render score.");
      });

    return () => {
      cancelled = true;
      cancelPositionBuild?.();
      colorScoreNotes(highlightedNotesRef.current, "#000000");
      highlightedNotesRef.current = [];
      highlightedIndexRef.current = -1;
      scorePositionsRef.current = [];
      osmdRef.current?.clear();
      osmdRef.current = null;
      container.innerHTML = "";
    };
  }, [score, updateScorePosition]);

  useEffect(() => {
    if (!score || !active) {
      return undefined;
    }

    updateScorePosition(usePracticeStore.getState().positionBeats);
    return usePracticeStore.subscribe((state, previousState) => {
      if (state.positionBeats !== previousState.positionBeats) {
        updateScorePosition(state.positionBeats);
      }
    });
  }, [active, score, updateScorePosition]);

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
        Measure {currentMeasure(score, usePracticeStore.getState().positionBeats)}
      </div>
      {error ? <div className="score-error">{error}</div> : null}
      <div className="score-scroll" ref={viewRef}>
        <div className="score-canvas" ref={containerRef} />
      </div>
    </div>
  );
});
