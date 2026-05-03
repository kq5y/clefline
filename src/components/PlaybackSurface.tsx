import { lazy, memo, Suspense } from "react";
import { usePracticeStore } from "../store/practiceStore";
import { NoteRiver } from "./NoteRiver";
import { PlaybackMetadata } from "./PlaybackMetadata";
import { ProgressTrack } from "./ProgressTrack";

const ScoreView = lazy(() =>
  import("./ScoreView").then((module) => ({ default: module.ScoreView })),
);

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

  const scoreVisible = viewMode === "score";

  return (
    <section className="viewer-panel" aria-label="Music viewer">
      <ProgressTrack />
      <PlaybackMetadata />
      <div className={scoreVisible ? "viewer-layer inactive" : "viewer-layer active"}>
        {scoreVisible ? null : <RiverPlaybackLayer />}
      </div>
      {scoreVisible ? (
        <div className={scoreVisible ? "viewer-layer active" : "viewer-layer inactive"}>
          <Suspense fallback={<div className="empty-state">Loading notation...</div>}>
            <ScoreView active={scoreVisible} score={score} />
          </Suspense>
        </div>
      ) : null}
    </section>
  );
});
