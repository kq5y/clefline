import { useEffect, useMemo, useRef, useState } from "react";
import type { OpenSheetMusicDisplay as OSMDInstance } from "opensheetmusicdisplay";
import type { Hand, PlaybackEvent, ScoreModel } from "../lib/musicxml";

type ScoreViewProps = {
  score?: ScoreModel;
  positionBeats: number;
  playbackEvents: PlaybackEvent[];
  activeNotes: Array<{ midi: number; hand: Hand; pitchName: string }>;
};

type ColorableGraphicalNote = {
  setColor: (color: string, options: Record<string, boolean>) => void;
};

type ScorePosition = {
  beat: number;
  x: number;
  notes: ColorableGraphicalNote[];
};

function currentMeasure(score: ScoreModel, positionBeats: number): string {
  const measure = score.measures.findLast((item) => item.startBeat <= positionBeats);

  return measure?.number ?? score.measures[0]?.number ?? "1";
}

function uniqueEventStarts(playbackEvents: PlaybackEvent[]): number[] {
  return Array.from(new Set(playbackEvents.map((event) => event.sourceStartBeat.toFixed(5))))
    .map(Number)
    .toSorted((a, b) => a - b);
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

function buildScorePositions(
  osmd: OSMDInstance,
  view: HTMLDivElement,
  starts: number[],
): ScorePosition[] {
  const cursors = osmd.cursors.length > 0 ? osmd.cursors : [osmd.cursor];
  const positions: ScorePosition[] = [];
  view.scrollLeft = 0;
  for (const cursor of cursors) {
    cursor.reset();
    cursor.show();
  }

  for (const beat of starts) {
    const x = cursorXInScroll(view);
    if (x !== undefined) {
      const notes = Array.from(
        new Set(
          cursors.flatMap((cursor) => cursor.GNotesUnderCursor() as ColorableGraphicalNote[]),
        ),
      );
      positions.push({ beat, x, notes });
    }
    for (const cursor of cursors) {
      cursor.next();
    }
  }

  for (const cursor of cursors) {
    cursor.hide();
  }

  return positions;
}

function positionIndexForBeat(positions: ScorePosition[], positionBeats: number): number {
  return positions.findLastIndex((position) => position.beat <= positionBeats);
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

export function ScoreView({ score, positionBeats, playbackEvents, activeNotes }: ScoreViewProps) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OSMDInstance | null>(null);
  const targetScrollRef = useRef(0);
  const animationRef = useRef<number | undefined>(undefined);
  const highlightedNotesRef = useRef<ColorableGraphicalNote[]>([]);
  const highlightedIndexRef = useRef(-1);
  const [error, setError] = useState<string | undefined>();
  const [renderToken, setRenderToken] = useState(0);
  const [scorePositions, setScorePositions] = useState<ScorePosition[]>([]);
  const starts = useMemo(() => uniqueEventStarts(playbackEvents), [playbackEvents]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !score) {
      return undefined;
    }

    let cancelled = false;
    container.innerHTML = "";
    osmdRef.current = null;
    setScorePositions([]);
    setError(undefined);

    void import("opensheetmusicdisplay")
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
        await osmd.load(score.rawXml);
        if (!cancelled) {
          osmd.render();
          osmd.enableOrDisableCursors(true);
          for (const cursor of osmd.cursors.length > 0 ? osmd.cursors : [osmd.cursor]) {
            cursor.reset();
            cursor.show();
          }
          osmdRef.current = osmd;
          window.requestAnimationFrame(() => {
            if (!cancelled && viewRef.current) {
              setScorePositions(buildScorePositions(osmd, viewRef.current, starts));
            }
          });
          setRenderToken((value) => value + 1);
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to render score.");
      });

    return () => {
      cancelled = true;
      colorScoreNotes(highlightedNotesRef.current, "#000000");
      highlightedNotesRef.current = [];
      highlightedIndexRef.current = -1;
      if (animationRef.current !== undefined) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      osmdRef.current?.clear();
      osmdRef.current = null;
      container.innerHTML = "";
    };
  }, [score, starts]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !score || score.totalBeats <= 0) {
      return;
    }

    const currentPosition = xForBeat(scorePositions, positionBeats);
    const fallbackX = (positionBeats / score.totalBeats) * view.scrollWidth;
    targetScrollRef.current = Math.max(
      0,
      (currentPosition?.x ?? fallbackX) - view.clientWidth * 0.42,
    );

    if (
      currentPosition &&
      currentPosition.index !== highlightedIndexRef.current &&
      scorePositions[currentPosition.index]
    ) {
      colorScoreNotes(highlightedNotesRef.current, "#000000");
      highlightedNotesRef.current = scorePositions[currentPosition.index].notes;
      highlightedIndexRef.current = currentPosition.index;
      colorScoreNotes(highlightedNotesRef.current, "#e05842");
    }

    if (animationRef.current !== undefined) {
      return;
    }

    const animate = () => {
      const currentView = viewRef.current;
      if (!currentView) {
        animationRef.current = undefined;
        return;
      }
      const maxScroll = Math.max(0, currentView.scrollWidth - currentView.clientWidth);
      const target = Math.min(maxScroll, targetScrollRef.current);
      const delta = target - currentView.scrollLeft;
      if (Math.abs(delta) < 0.6) {
        currentView.scrollLeft = target;
        animationRef.current = undefined;
        return;
      }

      currentView.scrollLeft += delta * 0.22;
      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);
  }, [positionBeats, renderToken, score, scorePositions]);

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
      <div className="score-current-measure">Measure {currentMeasure(score, positionBeats)}</div>
      {activeNotes.length > 0 ? (
        <div className="score-active-notes" aria-label="Current score notes">
          {activeNotes.slice(0, 8).map((note, index) => (
            <span
              className={`score-note-chip ${note.hand}`}
              key={`${note.midi}-${note.hand}-${index}`}
            >
              {note.pitchName}
            </span>
          ))}
        </div>
      ) : null}
      {error ? <div className="score-error">{error}</div> : null}
      <div className="score-scroll" ref={viewRef}>
        <div className="score-canvas" ref={containerRef} />
      </div>
    </div>
  );
}
