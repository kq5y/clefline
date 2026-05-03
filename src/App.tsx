import "./App.css";
import { useState, type DragEvent } from "react";
import { Controls } from "./components/Controls";
import { NoteRiver } from "./components/NoteRiver";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { ScoreView } from "./components/ScoreView";
import { usePlaybackClock } from "./hooks/usePlaybackClock";
import { useTonePlayback } from "./hooks/useTonePlayback";
import { activeNotesAt, usePracticeStore } from "./store/practiceStore";

function App() {
  const [dragActive, setDragActive] = useState(false);
  usePlaybackClock();
  useTonePlayback();
  const score = usePracticeStore((state) => state.score);
  const playbackEvents = usePracticeStore((state) => state.playbackEvents);
  const positionBeats = usePracticeStore((state) => state.positionBeats);
  const settings = usePracticeStore((state) => state.settings);
  const loadFile = usePracticeStore((state) => state.loadFile);
  const activeNotes = activeNotesAt(playbackEvents, positionBeats);
  const progress = score?.totalBeats ? (positionBeats / score.totalBeats) * 100 : 0;
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
        {settings.viewMode === "river" ? (
          <NoteRiver
            score={score}
            positionBeats={positionBeats}
            handMode={settings.handMode}
            showNoteNames={settings.showNoteNames}
          />
        ) : (
          <ScoreView score={score} positionBeats={positionBeats} />
        )}
      </section>
      <section className="keyboard-shell" aria-label="Piano keyboard">
        <PianoKeyboard activeNotes={activeNotes} showNoteNames={settings.showNoteNames} />
      </section>
      {dragActive ? <div className="drop-overlay">Drop MusicXML here</div> : null}
    </main>
  );
}

export default App;
