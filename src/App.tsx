import "./App.css";
import { useEffect, useState, type DragEvent } from "react";
import { Controls } from "./components/Controls";
import { KeyboardShell } from "./components/KeyboardShell";
import { PlaybackSurface } from "./components/PlaybackSurface";
import { usePlaybackClock } from "./hooks/usePlaybackClock";
import { useTonePlayback } from "./hooks/useTonePlayback";
import { ensurePianoEngine } from "./lib/audio/pianoEngine";
import { usePracticeStore } from "./store/practiceStore";

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

function App() {
  const [dragActive, setDragActive] = useState(false);
  usePlaybackClock();
  useTonePlayback();
  const loadFile = usePracticeStore((state) => state.loadFile);
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
      if (state.audioStatus === "loading") {
        return;
      }

      void state.preloadAudio().then(async (ready) => {
        if (!ready) {
          return;
        }

        try {
          await ensurePianoEngine();
          const latest = usePracticeStore.getState();
          if (latest.score && !latest.isPlaying) {
            latest.togglePlaying();
          }
        } catch (error) {
          usePracticeStore
            .getState()
            .setAudioError(
              `Audio start failed: ${
                error instanceof Error ? error.message : "Failed to start piano audio."
              }`,
            );
        }
      });
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main
      className={dragActive ? "app-shell drag-active" : "app-shell"}
      onDragLeave={() => setDragActive(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Controls />
      <PlaybackSurface />
      <KeyboardShell />
      {dragActive ? <div className="drop-overlay">Drop MusicXML here</div> : null}
    </main>
  );
}

export default App;
