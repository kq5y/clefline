import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay as OSMDInstance } from "opensheetmusicdisplay";
import { sanitizeScoreDisplayXml } from "../lib/musicxml/displayXml";
import { loadOsmd } from "../lib/osmd";
import { loadAndRenderOsmdAsync } from "../lib/osmdAsync";
import {
  createPlaybackDisplayAnchor,
  displayPlaybackBeat,
  type PlaybackDisplayAnchor,
} from "../lib/playbackDisplayPosition";
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
  y: number;
  notes: ColorableGraphicalNote[];
};

type NoteHeadBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ScoreOffset = {
  x: number;
  y: number;
};

type ScoreBounds = {
  scrollWidth: number;
  scrollHeight: number;
  viewWidth: number;
  viewHeight: number;
};

type ViewOrigin = {
  left: number;
  top: number;
};

const OSMD_BEAT_FACTOR = 4;
const MAX_CURSOR_STEPS = 12_000;
const SCORE_ROW_GAP_PX = 140;
const SCORE_ROW_WRAP_THRESHOLD_RATIO = 0.22;
const HIGHLIGHT_UPDATE_INTERVAL_MS = 50;
const SCROLL_UPDATE_THRESHOLD_PX = 1;
const POSITION_BUILD_MIN_IDLE_MS = 4;
const POSITION_BUILD_FALLBACK_STEPS = 8;

const COLOR_NOTE_OPTIONS = {
  applyToBeams: true,
  applyToFlag: true,
  applyToLedgerLines: true,
  applyToModifiers: false,
  applyToNoteheads: true,
  applyToStem: true,
};

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

function cursorPointInView(
  view: HTMLDivElement,
  viewOrigin: ViewOrigin,
  contentOffset: ScoreOffset,
): { x: number; y: number } | undefined {
  const cursor = visibleCursorElement(view);
  if (!cursor) {
    return undefined;
  }

  const cursorBox = cursor.getBoundingClientRect();

  return {
    x: cursorBox.left - viewOrigin.left + contentOffset.x,
    y: cursorBox.top - viewOrigin.top + view.scrollTop + contentOffset.y,
  };
}

function pointForGraphicalNotes(
  notes: ColorableGraphicalNote[],
  view: HTMLDivElement,
  viewOrigin: ViewOrigin,
  contentOffset: ScoreOffset,
): { x: number; y: number } | undefined {
  const boxes = notes
    .map((note) => noteHeadBoxInView(note, view, viewOrigin, contentOffset))
    .filter((box): box is NoteHeadBox => Boolean(box));
  if (boxes.length === 0) {
    return undefined;
  }

  return boxes.reduce(
    (point, box) => ({
      x: Math.min(point.x, box.x),
      y: Math.min(point.y, box.y),
    }),
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
  );
}

function collectScorePosition(
  cursors: OSMDInstance["cursors"],
  primaryCursor: OSMDInstance["cursor"],
  view: HTMLDivElement,
  viewOrigin: ViewOrigin,
  contentOffset: ScoreOffset,
  positions: ScorePosition[],
  seenBeats: Set<string>,
  noteSet: Set<ColorableGraphicalNote>,
): void {
  const beat = primaryCursor.Iterator.CurrentSourceTimestamp.RealValue * OSMD_BEAT_FACTOR;
  const beatKey = beat.toFixed(5);
  if (seenBeats.has(beatKey)) {
    return;
  }
  noteSet.clear();
  for (const cursor of cursors) {
    for (const note of cursor.GNotesUnderCursor() as ColorableGraphicalNote[]) {
      noteSet.add(note);
    }
  }
  const notes = Array.from(noteSet);
  const point =
    pointForGraphicalNotes(notes, view, viewOrigin, contentOffset) ??
    cursorPointInView(view, viewOrigin, contentOffset);
  if (!point) {
    return;
  }

  seenBeats.add(beatKey);
  positions.push({ beat, x: point.x, y: point.y, notes });
}

function scoreRowAnchors(view: HTMLDivElement, contentOffset: ScoreOffset): number[] {
  const viewBox = view.getBoundingClientRect();
  const staffTops = (
    Array.from(view.querySelectorAll(".score-canvas svg .staffline")) as HTMLElement[]
  )
    .map(
      (element) =>
        element.getBoundingClientRect().top - viewBox.top + view.scrollTop + contentOffset.y,
    )
    .filter((top) => Number.isFinite(top))
    .toSorted((first, second) => first - second);

  if (staffTops.length === 0) {
    return [];
  }

  const rows: number[] = [];
  let currentTop = staffTops[0];
  let previousTop = staffTops[0];
  for (const top of staffTops.slice(1)) {
    if (top - previousTop > SCORE_ROW_GAP_PX) {
      rows.push(currentTop);
      currentTop = top;
    }
    previousTop = top;
  }
  rows.push(currentTop);

  return rows;
}

function normalizeScoreRows(
  positions: ScorePosition[],
  view: HTMLDivElement,
  contentOffset: ScoreOffset,
): ScorePosition[] {
  if (positions.length === 0) {
    return positions;
  }

  const rows = scoreRowAnchors(view, contentOffset);
  if (rows.length === 0) {
    return positions;
  }

  const wrapThreshold = Math.max(120, view.clientWidth * SCORE_ROW_WRAP_THRESHOLD_RATIO);
  let rowIndex = 0;
  let previousX = positions[0].x;

  return positions.map((position, index) => {
    if (index > 0 && position.x < previousX - wrapThreshold) {
      rowIndex += 1;
    }
    previousX = position.x;

    return {
      ...position,
      y: rows[Math.min(rowIndex, rows.length - 1)] ?? position.y,
    };
  });
}

function schedulePositionBuild(callback: (deadline?: IdleDeadline) => void): () => void {
  const idleWindow = window;
  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const id = idleWindow.requestIdleCallback(callback, { timeout: 200 });

    return () => idleWindow.cancelIdleCallback(id);
  }

  const id = window.setTimeout(() => callback(), 16);

  return () => window.clearTimeout(id);
}

function startScorePositionBuild(
  osmd: OSMDInstance,
  view: HTMLDivElement,
  getContentOffset: () => ScoreOffset,
  onComplete: (positions: ScorePosition[]) => void,
): () => void {
  const cursors = osmd.cursors.length > 0 ? osmd.cursors : [osmd.cursor];
  const primaryCursor = cursors[0];
  const positions: ScorePosition[] = [];
  const seenBeats = new Set<string>();
  const noteSet = new Set<ColorableGraphicalNote>();
  let cancelled = false;
  let steps = 0;
  let cancelSchedule: (() => void) | undefined;

  for (const cursor of cursors) {
    cursor.reset();
    cursor.hide();
  }

  const step = (deadline?: IdleDeadline) => {
    if (cancelled) {
      return;
    }

    const contentOffset = getContentOffset();
    const viewOrigin = view.getBoundingClientRect();
    let processed = 0;
    while (steps < MAX_CURSOR_STEPS && !primaryCursor.Iterator.EndReached) {
      if (deadline && processed > 0 && deadline.timeRemaining() < POSITION_BUILD_MIN_IDLE_MS) {
        break;
      }
      if (!deadline && processed >= POSITION_BUILD_FALLBACK_STEPS) {
        break;
      }

      collectScorePosition(cursors, primaryCursor, view, viewOrigin, contentOffset, positions, seenBeats, noteSet);
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
      onComplete(normalizeScoreRows(positions, view, getContentOffset()));
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

function scorePositionForBeat(
  positions: ScorePosition[],
  positionBeats: number,
): { index: number; x: number; y: number } | undefined {
  if (positions.length === 0) {
    return undefined;
  }

  const index = positionIndexForBeat(positions, positionBeats);
  if (index < 0) {
    return { index: 0, x: positions[0].x, y: positions[0].y };
  }
  const current = positions[index];
  const next = positions[index + 1];
  if (!next) {
    return { index, x: current.x, y: current.y };
  }

  const progress = Math.min(
    1,
    Math.max(0, (positionBeats - current.beat) / Math.max(0.001, next.beat - current.beat)),
  );

  return {
    index,
    x: current.x + (next.x - current.x) * progress,
    y: current.y, // Y jumps instantly to current row, no interpolation
  };
}

function colorScoreNotes(notes: ColorableGraphicalNote[], color: string): void {
  for (const note of notes) {
    try {
      note.setColor(color, COLOR_NOTE_OPTIONS);
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
  viewOrigin: ViewOrigin,
  contentOffset: ScoreOffset,
): NoteHeadBox | undefined {
  const element = noteHeadElement(note);
  if (!element) {
    return undefined;
  }

  const box = element.getBoundingClientRect();

  return {
    x: box.left - viewOrigin.left + contentOffset.x,
    y: box.top - viewOrigin.top + view.scrollTop + contentOffset.y,
    width: box.width,
    height: box.height,
  };
}

function scoreBounds(view: HTMLDivElement, track: HTMLDivElement): ScoreBounds {
  return {
    scrollWidth: track.scrollWidth,
    scrollHeight: track.scrollHeight,
    viewWidth: view.clientWidth,
    viewHeight: view.clientHeight,
  };
}

export const ScoreView = memo(function ScoreView({ active, score }: ScoreViewProps) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const glissandoOverlayRef = useRef<SVGSVGElement | null>(null);
  const osmdRef = useRef<OSMDInstance | null>(null);
  const activeRef = useRef(active);
  const scorePositionsRef = useRef<ScorePosition[]>([]);
  const highlightedNotesRef = useRef<ColorableGraphicalNote[]>([]);
  const highlightedIndexRef = useRef(-1);
  const lastHighlightTimeRef = useRef(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const positionBuildCancelRef = useRef<(() => void) | undefined>(undefined);
  const playbackAnchorRef = useRef<PlaybackDisplayAnchor>(createPlaybackDisplayAnchor());
  const scoreOffsetRef = useRef<ScoreOffset>({ x: 0, y: 0 });
  const scoreBoundsRef = useRef<ScoreBounds>({
    scrollHeight: 0,
    scrollWidth: 0,
    viewHeight: 0,
    viewWidth: 0,
  });
  const playbackLineRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>();
  const isPlaying = usePracticeStore((state) => state.isPlaying);
  const setPosition = usePracticeStore((state) => state.setPosition);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  activeRef.current = active;

  const setScoreOffset = useCallback((offset: ScoreOffset) => {
    scoreOffsetRef.current = offset;
    if (trackRef.current && isPlayingRef.current) {
      trackRef.current.style.transform = `translate3d(${-offset.x}px, ${-offset.y}px, 0)`;
    }
  }, []);

  const syncOffsetToScroll = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      scoreOffsetRef.current = { x: view.scrollLeft, y: view.scrollTop };
    }
  }, []);

  const handleScoreClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isPlayingRef.current) {
        return;
      }
      const view = viewRef.current;
      if (!view || !score) {
        return;
      }
      const rect = view.getBoundingClientRect();
      const clickX = event.clientX - rect.left + view.scrollLeft;
      const clickY = event.clientY - rect.top + view.scrollTop;

      const positions = scorePositionsRef.current;
      if (positions.length === 0) {
        return;
      }

      let closestPosition = positions[0];
      let minDistance = Number.MAX_VALUE;
      for (const pos of positions) {
        const dx = pos.x - clickX;
        const dy = pos.y - clickY;
        const distance = dx * dx + dy * dy;
        if (distance < minDistance) {
          minDistance = distance;
          closestPosition = pos;
        }
      }

      setPosition(closestPosition.beat);
    },
    [score, setPosition],
  );
  const contentOffset = useCallback((): ScoreOffset => scoreOffsetRef.current, []);
  const refreshScoreBounds = useCallback(() => {
    const view = viewRef.current;
    const track = trackRef.current;
    if (!view || !track) {
      return;
    }

    scoreBoundsRef.current = scoreBounds(view, track);
  }, []);

  const updateScorePosition = useCallback(
    (positionBeats: number, frameTime = window.performance.now()) => {
      const view = viewRef.current;
      const track = trackRef.current;
      const playbackLine = playbackLineRef.current;
      if (!view || !track || !score || score.totalBeats <= 0) {
        return;
      }

      const scorePositions = scorePositionsRef.current;
      const currentPosition = scorePositionForBeat(scorePositions, positionBeats);
      let bounds = scoreBoundsRef.current;
      if (bounds.scrollWidth <= 0 || bounds.viewWidth <= 0) {
        bounds = scoreBounds(view, track);
        scoreBoundsRef.current = bounds;
      }

      const fallbackX = (positionBeats / score.totalBeats) * bounds.scrollWidth;
      const lineX = currentPosition?.x ?? fallbackX;
      const maxScrollX = Math.max(0, bounds.scrollWidth - bounds.viewWidth);
      const maxScrollY = Math.max(0, bounds.scrollHeight - bounds.viewHeight);
      const targetScrollX = Math.min(maxScrollX, Math.max(0, lineX - bounds.viewWidth * 0.42));
      const targetScrollY = Math.min(
        maxScrollY,
        Math.max(0, (currentPosition?.y ?? 0) - bounds.viewHeight * 0.3),
      );
      if (
        Math.abs(scoreOffsetRef.current.x - targetScrollX) > SCROLL_UPDATE_THRESHOLD_PX ||
        Math.abs(scoreOffsetRef.current.y - targetScrollY) > SCROLL_UPDATE_THRESHOLD_PX
      ) {
        setScoreOffset({ x: targetScrollX, y: targetScrollY });
      }

      if (playbackLine) {
        playbackLine.style.left = `${lineX}px`;
      }

      const nextHighlightIndex = positionBeats < 0 ? -1 : (currentPosition?.index ?? -1);
      const shouldUpdateHighlight =
        nextHighlightIndex !== highlightedIndexRef.current &&
        (nextHighlightIndex < 0 ||
          highlightedIndexRef.current < 0 ||
          nextHighlightIndex < highlightedIndexRef.current ||
          frameTime - lastHighlightTimeRef.current >= HIGHLIGHT_UPDATE_INTERVAL_MS);
      if (shouldUpdateHighlight) {
        colorScoreNotes(highlightedNotesRef.current, "#000000");
        const nextNotes =
          nextHighlightIndex >= 0 ? (scorePositions[nextHighlightIndex]?.notes ?? []) : [];
        highlightedNotesRef.current = nextNotes;
        highlightedIndexRef.current = nextHighlightIndex;
        lastHighlightTimeRef.current = frameTime;
        if (nextNotes.length > 0) {
          colorScoreNotes(nextNotes, "#e05842");
        }
      }
    },
    [score, setScoreOffset],
  );
  const startScorePositionIndexBuild = useCallback(() => {
    const osmd = osmdRef.current;
    const view = viewRef.current;
    if (
      !osmd ||
      !view ||
      !score ||
      scorePositionsRef.current.length > 0 ||
      positionBuildCancelRef.current
    ) {
      return;
    }

    positionBuildCancelRef.current = startScorePositionBuild(
      osmd,
      view,
      contentOffset,
      (positions) => {
        if (!viewRef.current) {
          return;
        }

        positionBuildCancelRef.current = undefined;
        scorePositionsRef.current = positions;
        refreshScoreBounds();
        const latestState = usePracticeStore.getState();
        updateScorePosition(
          sourceBeatAt(latestState.playbackEvents, latestState.positionBeats),
          window.performance.now(),
        );
        if (!latestState.isPlaying && viewRef.current) {
          viewRef.current.scrollLeft = scoreOffsetRef.current.x;
          viewRef.current.scrollTop = scoreOffsetRef.current.y;
        }
        setLoadingMessage(undefined);
      },
    );
  }, [contentOffset, refreshScoreBounds, score, updateScorePosition]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !score) {
      return undefined;
    }

    const glissandoOverlay = glissandoOverlayRef.current;
    let cancelled = false;
    container.innerHTML = "";
    glissandoOverlay?.replaceChildren();
    osmdRef.current = null;
    scorePositionsRef.current = [];
    scoreBoundsRef.current = {
      scrollHeight: 0,
      scrollWidth: 0,
      viewHeight: 0,
      viewWidth: 0,
    };
    setScoreOffset({ x: 0, y: 0 });
    setError(undefined);
    setLoadingMessage("Initializing...");

    const configureOsmd = (osmd: OSMDInstance) => {
      osmd.EngravingRules.RenderSingleHorizontalStaffline = true;
      osmd.EngravingRules.RenderGlissandi = true;
      osmd.EngravingRules.RehearsalMarkYOffsetDefault = 20;
      osmd.EngravingRules.RehearsalMarkYOffsetAddedForRehearsalMarks = 0;
      osmd.EngravingRules.RehearsalMarkFontSize = 11;
      // Prevent narrow measures with whole notes
      (osmd.EngravingRules as { MinimumMeasureWidth?: number }).MinimumMeasureWidth = 10;
      // Add margin before bar lines to prevent note overlap
      osmd.EngravingRules.MeasureRightMargin = 4.0;
      // Increase spacing between notes
      osmd.EngravingRules.VoiceSpacingAddendVexflow = 6.0;
      osmd.Zoom = 0.92;
    };

    const osmdOptions = {
      backend: "svg" as const,
      autoResize: false,
      disableCursor: false,
      followCursor: false,
      cursorsOptions: [
        { type: 1, color: "#e05842", alpha: 0.95, follow: false },
        { type: 0, color: "#ffd166", alpha: 0.34, follow: false },
      ],
      drawComposer: false,
      drawTitle: false,
      drawingParameters: "compacttight" as const,
      pageFormat: "Endless" as const,
      renderSingleHorizontalStaffline: true,
    };

    const finishRender = (osmd: OSMDInstance) => {
      osmd.enableOrDisableCursors(true);
      for (const cursor of osmd.cursors.length > 0 ? osmd.cursors : [osmd.cursor]) {
        cursor.reset();
        cursor.hide();
      }
      osmdRef.current = osmd;
      refreshScoreBounds();
      if (activeRef.current) {
        setLoadingMessage("Building positions...");
        startScorePositionIndexBuild();
      } else {
        setLoadingMessage(undefined);
      }
    };

    void loadOsmd()
      .then(async ({ OpenSheetMusicDisplay }) => {
        if (cancelled) return;

        const sanitizedXml = sanitizeScoreDisplayXml(score.rawXml);
        const osmd = new OpenSheetMusicDisplay(container, osmdOptions);
        configureOsmd(osmd);

        await loadAndRenderOsmdAsync(osmd, sanitizedXml, (message, percent) => {
          if (!cancelled) {
            setLoadingMessage(`${message} (${percent}%)`);
          }
        });

        if (cancelled) return;
        finishRender(osmd);
      })
      .catch((reason: unknown) => {
        setLoadingMessage(undefined);
        setError(
          `Notation render failed: ${
            reason instanceof Error ? reason.message : "Failed to render score."
          }`,
        );
      });

    return () => {
      cancelled = true;
      positionBuildCancelRef.current?.();
      positionBuildCancelRef.current = undefined;
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      colorScoreNotes(highlightedNotesRef.current, "#000000");
      highlightedNotesRef.current = [];
      highlightedIndexRef.current = -1;
      lastHighlightTimeRef.current = 0;
      setScoreOffset({ x: 0, y: 0 });
      scorePositionsRef.current = [];
      scoreBoundsRef.current = {
        scrollHeight: 0,
        scrollWidth: 0,
        viewHeight: 0,
        viewWidth: 0,
      };
      glissandoOverlay?.replaceChildren();
      osmdRef.current?.clear();
      osmdRef.current = null;
      container.innerHTML = "";
    };
  }, [
    refreshScoreBounds,
    score,
    setScoreOffset,
    startScorePositionIndexBuild,
    updateScorePosition,
  ]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    refreshScoreBounds();
    window.addEventListener("resize", refreshScoreBounds);

    return () => window.removeEventListener("resize", refreshScoreBounds);
  }, [active, refreshScoreBounds]);

  useEffect(() => {
    if (!score || !active) {
      return undefined;
    }

    startScorePositionIndexBuild();

    const frame = (frameTime: number) => {
      const state = usePracticeStore.getState();
      if (!state.isPlaying) {
        animationFrameRef.current = undefined;
        return;
      }
      if (scorePositionsRef.current.length === 0) {
        startScorePositionIndexBuild();
      }

      const positionBeats = displayPlaybackBeat(state, playbackAnchorRef.current, frameTime);
      const sourceBeat = sourceBeatAt(state.playbackEvents, positionBeats);
      updateScorePosition(sourceBeat, frameTime);
      animationFrameRef.current = window.requestAnimationFrame(frame);
    };

    const startAnimation = () => {
      if (animationFrameRef.current === undefined) {
        animationFrameRef.current = window.requestAnimationFrame(frame);
      }
    };

    const handleStoreChange = (state: ReturnType<typeof usePracticeStore.getState>) => {
      if (state.isPlaying) {
        startAnimation();
      } else {
        const sourceBeat = sourceBeatAt(state.playbackEvents, state.positionBeats);
        updateScorePosition(sourceBeat, window.performance.now());
      }
    };

    const currentState = usePracticeStore.getState();
    handleStoreChange(currentState);
    const unsubscribe = usePracticeStore.subscribe((nextState, prevState) => {
      if (
        nextState.isPlaying !== prevState.isPlaying ||
        nextState.positionBeats !== prevState.positionBeats ||
        nextState.playbackEvents !== prevState.playbackEvents
      ) {
        handleStoreChange(nextState);
      }
    });

    return () => {
      unsubscribe();
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      if (scorePositionsRef.current.length === 0) {
        positionBuildCancelRef.current?.();
        positionBuildCancelRef.current = undefined;
      }
    };
  }, [active, score, startScorePositionIndexBuild, updateScorePosition]);

  useEffect(() => {
    const view = viewRef.current;
    const track = trackRef.current;
    if (!view || !track || !active) {
      return;
    }

    if (isPlaying) {
      syncOffsetToScroll();
      track.style.transform = `translate3d(${-scoreOffsetRef.current.x}px, ${-scoreOffsetRef.current.y}px, 0)`;
      view.scrollLeft = 0;
      view.scrollTop = 0;
    } else {
      const savedOffset = { ...scoreOffsetRef.current };
      track.style.transform = "none";
      requestAnimationFrame(() => {
        view.scrollLeft = savedOffset.x;
        view.scrollTop = savedOffset.y;
      });
    }
  }, [active, isPlaying, syncOffsetToScroll]);

  if (!score) {
    return (
      <div className="empty-state">
        <p>Load MusicXML to view notation.</p>
      </div>
    );
  }

  return (
    <div className="score-view">
      {error ? <div className="score-error">{error}</div> : null}
      {loadingMessage ? <div className="score-loading">{loadingMessage}</div> : null}
      <div
        className={isPlaying ? "score-scroll" : "score-scroll scrollable"}
        ref={viewRef}
        onClick={handleScoreClick}
        style={loadingMessage ? { visibility: "hidden" } : undefined}
      >
        <div className="score-track" ref={trackRef}>
          <div className="score-playback-line" ref={playbackLineRef} aria-hidden="true" />
          <svg className="score-glissando-overlay" ref={glissandoOverlayRef} aria-hidden="true" />
          <div className="score-canvas" ref={containerRef} />
        </div>
      </div>
    </div>
  );
});
