import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import { usePracticeStore } from "../store/practiceStore";
import { NoteRiver } from "./NoteRiver";
import { PlaybackMetadata } from "./PlaybackMetadata";
import { ProgressTrack } from "./ProgressTrack";

const loadScoreView = () => import("./ScoreView").then((module) => ({ default: module.ScoreView }));
const ScoreView = lazy(loadScoreView);

function preloadScoreView(): void {
  void loadScoreView();
}

const RiverPlaybackLayer = memo(function RiverPlaybackLayer() {
  const score = usePracticeStore((state) => state.score);
  const handMode = usePracticeStore((state) => state.settings.handMode);
  const riverZoom = usePracticeStore((state) => state.settings.riverZoom);
  const showMeasureLines = usePracticeStore((state) => state.settings.showMeasureLines);
  const showNoteNames = usePracticeStore((state) => state.settings.showNoteNames);

  return (
    <NoteRiver
      score={score}
      handMode={handMode}
      riverZoom={riverZoom}
      showMeasureLines={showMeasureLines}
      showNoteNames={showNoteNames}
    />
  );
});

export const PlaybackSurface = memo(function PlaybackSurface() {
  const score = usePracticeStore((state) => state.score);
  const viewMode = usePracticeStore((state) => state.settings.viewMode);
  const [scoreMounted, setScoreMounted] = useState(false);
  const previousScoreRef = useRef(score);

  const scoreVisible = viewMode === "score";

  useEffect(() => {
    if (!score) {
      setScoreMounted(false);
      return undefined;
    }

    preloadScoreView();
    if (previousScoreRef.current !== score) {
      previousScoreRef.current = score;
      setScoreMounted(scoreVisible);
      return undefined;
    }

    if (scoreVisible) {
      setScoreMounted(true);
    }

    return undefined;
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
