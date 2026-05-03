import { memo, useEffect, useState } from "react";
import { preloadOsmd } from "../lib/osmd";
import { scheduleIdle } from "../lib/scheduleIdle";
import { usePracticeStore } from "../store/practiceStore";
import { NoteRiver } from "./NoteRiver";
import { PlaybackMetadata } from "./PlaybackMetadata";
import { ProgressTrack } from "./ProgressTrack";
import { ScoreView } from "./ScoreView";

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
  const [scorePrepared, setScorePrepared] = useState(false);
  const score = usePracticeStore((state) => state.score);
  const viewMode = usePracticeStore((state) => state.settings.viewMode);

  useEffect(() => {
    preloadOsmd();
  }, []);

  useEffect(() => {
    if (!score) {
      setScorePrepared(false);
      return undefined;
    }

    setScorePrepared(false);
    const cancel = scheduleIdle(() => {
      const state = usePracticeStore.getState();
      if (state.score === score && !state.isPlaying) {
        setScorePrepared(true);
      }
    });

    return cancel;
  }, [score]);

  useEffect(() => {
    if (viewMode === "score") {
      setScorePrepared(true);
    }
  }, [viewMode]);

  const scoreVisible = viewMode === "score";
  const shouldMountScore = scoreVisible || scorePrepared;

  return (
    <section className="viewer-panel" aria-label="Music viewer">
      <ProgressTrack />
      <PlaybackMetadata />
      <div className={scoreVisible ? "viewer-layer inactive" : "viewer-layer active"}>
        {scoreVisible ? null : <RiverPlaybackLayer />}
      </div>
      {shouldMountScore ? (
        <div className={scoreVisible ? "viewer-layer active" : "viewer-layer inactive"}>
          <ScoreView active={scoreVisible} score={score} />
        </div>
      ) : null}
    </section>
  );
});
