import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { OpenSheetMusicDisplay as OSMDInstance } from "opensheetmusicdisplay";
import type { Hand, PlaybackEvent, ScoreModel } from "../lib/musicxml";

type ScoreViewProps = {
  score?: ScoreModel;
  positionBeats: number;
  playbackEvents: PlaybackEvent[];
  activeNotes: Array<{ midi: number; hand: Hand; pitchName: string }>;
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

function cursorStepAt(starts: number[], positionBeats: number): number {
  const index = starts.findLastIndex((beat) => beat <= positionBeats);

  return Math.max(0, index);
}

function moveCursors(osmd: OSMDInstance, cursorStepRef: MutableRefObject<number>, step: number) {
  const cursors = osmd.cursors.length > 0 ? osmd.cursors : [osmd.cursor];
  if (step < cursorStepRef.current) {
    for (const cursor of cursors) {
      cursor.reset();
    }
    cursorStepRef.current = 0;
  }

  while (cursorStepRef.current < step) {
    for (const cursor of cursors) {
      cursor.next();
    }
    cursorStepRef.current += 1;
  }

  for (const cursor of cursors) {
    cursor.show();
  }
}

function followCursorElement(view: HTMLDivElement): void {
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
    }) ?? null;
  if (!cursor) {
    return;
  }

  const cursorBox = cursor.getBoundingClientRect();
  const viewBox = view.getBoundingClientRect();
  const targetLeft = viewBox.left + view.clientWidth * 0.42;
  const delta = cursorBox.left - targetLeft;
  if (Math.abs(delta) < 2) {
    return;
  }

  view.scrollTo({
    left: Math.max(0, view.scrollLeft + delta),
    top: 0,
    behavior: "auto",
  });
}

export function ScoreView({ score, positionBeats, playbackEvents, activeNotes }: ScoreViewProps) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OSMDInstance | null>(null);
  const cursorStepRef = useRef(0);
  const [error, setError] = useState<string | undefined>();
  const [renderToken, setRenderToken] = useState(0);
  const starts = useMemo(() => uniqueEventStarts(playbackEvents), [playbackEvents]);
  const cursorStep = cursorStepAt(starts, positionBeats);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !score) {
      return undefined;
    }

    let cancelled = false;
    container.innerHTML = "";
    osmdRef.current = null;
    cursorStepRef.current = 0;
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
          setRenderToken((value) => value + 1);
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to render score.");
      });

    return () => {
      cancelled = true;
      osmdRef.current?.clear();
      osmdRef.current = null;
      container.innerHTML = "";
    };
  }, [score]);

  useEffect(() => {
    if (!osmdRef.current) {
      return;
    }

    moveCursors(osmdRef.current, cursorStepRef, cursorStep);
    if (viewRef.current) {
      followCursorElement(viewRef.current);
    }
  }, [cursorStep, renderToken]);

  if (!score) {
    return (
      <div className="empty-state">
        <p>Load MusicXML to view notation.</p>
      </div>
    );
  }

  return (
    <div className="score-view">
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
