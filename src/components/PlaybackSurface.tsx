import { lazy, memo, Suspense, useEffect, useState } from "react";
import { usePracticeStore } from "../store/practiceStore";
import { NoteRiver } from "./NoteRiver";
import { PlaybackMetadata } from "./PlaybackMetadata";
import { ProgressTrack } from "./ProgressTrack";

const loadScoreView = () => import("./ScoreView").then((module) => ({ default: module.ScoreView }));
const ScoreView = lazy(loadScoreView);

function preloadScoreView(): void {
  void loadScoreView();
}

function scheduleScoreWarmup(callback: () => void): () => void {
  if (window.requestIdleCallback && window.cancelIdleCallback) {
    const id = window.requestIdleCallback(callback, { timeout: 900 });

    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(callback, 250);

  return () => window.clearTimeout(id);
}

const RiverPlaybackLayer = memo(function RiverPlaybackLayer() {
  const score = usePracticeStore((state) => state.score);
  const settings = usePracticeStore((state) => state.settings);

  return (
    <NoteRiver
      score={score}
      handMode={settings.handMode}
      riverZoom={settings.riverZoom}
      showMeasureLines={settings.showMeasureLines}
      showNoteNames={settings.showNoteNames}
    />
  );
});

export const PlaybackSurface = memo(function PlaybackSurface() {
  const score = usePracticeStore((state) => state.score);
  const viewMode = usePracticeStore((state) => state.settings.viewMode);
  const [scoreMounted, setScoreMounted] = useState(false);

  const scoreVisible = viewMode === "score";

  useEffect(() => {
    if (!score) {
      setScoreMounted(false);
      return undefined;
    }

    preloadScoreView();
    if (scoreVisible) {
      setScoreMounted(true);
      return undefined;
    }

    let cancelled = false;
    let cancelWarmup: (() => void) | undefined;
    const runWarmup = () => {
      if (cancelled) {
        return;
      }

      if (usePracticeStore.getState().isPlaying) {
        cancelWarmup = scheduleScoreWarmup(runWarmup);
        return;
      }

      setScoreMounted(true);
    };

    cancelWarmup = scheduleScoreWarmup(runWarmup);

    return () => {
      cancelled = true;
      cancelWarmup?.();
    };
  }, [score, scoreVisible]);

  return (
    <section className="viewer-panel" aria-label="Music viewer">
      <ProgressTrack />
      <PlaybackMetadata />
      <div className={scoreVisible ? "viewer-layer inactive" : "viewer-layer active"}>
        {scoreVisible ? null : <RiverPlaybackLayer />}
      </div>
      {scoreMounted ? (
        <div className={scoreVisible ? "viewer-layer active" : "viewer-layer inactive"}>
          <Suspense fallback={<div className="empty-state">Loading notation...</div>}>
            <ScoreView active={scoreVisible} score={score} />
          </Suspense>
        </div>
      ) : null}
    </section>
  );
});
