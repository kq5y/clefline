import "./App.css";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Controls } from "./components/Controls";
import { NoteRiver } from "./components/NoteRiver";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { PlaybackMetadata } from "./components/PlaybackMetadata";
import { ScoreView } from "./components/ScoreView";
import { usePlaybackClock } from "./hooks/usePlaybackClock";
import { useTonePlayback } from "./hooks/useTonePlayback";
import { ensurePianoEngine } from "./lib/audio/pianoEngine";
import { preloadOsmd } from "./lib/osmd";
import { activeNotesAt, minimumPositionBeats, usePracticeStore } from "./store/practiceStore";

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

function isButtonTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button, [role='button'], .icon-button"))
  );
}

function scheduleIdle(callback: () => void): () => void {
  if (window.requestIdleCallback && window.cancelIdleCallback) {
    const id = window.requestIdleCallback(callback, { timeout: 1_200 });

    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(callback, 300);

  return () => window.clearTimeout(id);
}

function App() {
  const [dragActive, setDragActive] = useState(false);
  const [scorePrepared, setScorePrepared] = useState(false);
  usePlaybackClock();
  useTonePlayback();
  const score = usePracticeStore((state) => state.score);
  const playbackEvents = usePracticeStore((state) => state.playbackEvents);
  const positionBeats = usePracticeStore((state) => state.positionBeats);
  const settings = usePracticeStore((state) => state.settings);
  const loadFile = usePracticeStore((state) => state.loadFile);
  const activeNotes = useMemo(
    () => activeNotesAt(playbackEvents, positionBeats),
    [playbackEvents, positionBeats],
  );
  const minimumPosition = minimumPositionBeats(score);
  const progress = score?.totalBeats
    ? ((positionBeats - minimumPosition) / (score.totalBeats - minimumPosition)) * 100
    : 0;
  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(true);
  };
  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void loadFile(file);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const state = usePracticeStore.getState();
      if (!state.score) {
        return;
      }

      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        state.seekByMeasures(event.code === "ArrowLeft" ? -1 : 1);
        return;
      }

      if (event.repeat || event.code !== "Space" || isButtonTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (state.isPlaying) {
        state.togglePlaying();
        return;
      }

      void ensurePianoEngine().then(() => {
        const latest = usePracticeStore.getState();
        if (latest.score && !latest.isPlaying) {
          latest.togglePlaying();
        }
      });
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    preloadOsmd();
  }, []);

  useEffect(() => {
    if (!score) {
      setScorePrepared(false);
      return undefined;
    }

    const cancel = scheduleIdle(() => {
      const state = usePracticeStore.getState();
      if (state.score === score && !state.isPlaying) {
        setScorePrepared(true);
      }
    });

    return cancel;
  }, [score]);

  useEffect(() => {
    if (settings.viewMode === "score") {
      setScorePrepared(true);
    }
  }, [settings.viewMode]);

  const scoreVisible = settings.viewMode === "score";
  const shouldMountScore = scoreVisible || scorePrepared;

  return (
    <main
      className={dragActive ? "app-shell drag-active" : "app-shell"}
      onDragLeave={() => setDragActive(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Controls />
      <section className="viewer-panel" aria-label="Music viewer">
        <div className="progress-track">
          <div style={{ width: `${progress}%` }} />
        </div>
        <PlaybackMetadata
          score={score}
          playbackEvents={playbackEvents}
          positionBeats={positionBeats}
        />
        <div className={scoreVisible ? "viewer-layer inactive" : "viewer-layer active"}>
          <NoteRiver
            score={score}
            positionBeats={positionBeats}
            handMode={settings.handMode}
            riverZoom={settings.riverZoom}
            showMeasureLines={settings.showMeasureLines}
            showNoteNames={settings.showNoteNames}
          />
        </div>
        {shouldMountScore ? (
          <div className={scoreVisible ? "viewer-layer active" : "viewer-layer inactive"}>
            <ScoreView active={scoreVisible} score={score} />
          </div>
        ) : null}
      </section>
      <section className="keyboard-shell" aria-label="Piano keyboard">
        <PianoKeyboard
          activeNotes={activeNotes}
          showNoteNames={settings.showNoteNames}
          volume={settings.volume}
        />
      </section>
      {dragActive ? <div className="drop-overlay">Drop MusicXML here</div> : null}
    </main>
  );
}

export default App;
