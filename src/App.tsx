import "./App.css";
import { Controls } from "./components/Controls";
import { NoteRiver } from "./components/NoteRiver";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { ScoreView } from "./components/ScoreView";
import { usePlaybackClock } from "./hooks/usePlaybackClock";
import { useTonePlayback } from "./hooks/useTonePlayback";
import { activeMidiAt, usePracticeStore } from "./store/practiceStore";

function App() {
  usePlaybackClock();
  useTonePlayback();
  const score = usePracticeStore((state) => state.score);
  const playbackEvents = usePracticeStore((state) => state.playbackEvents);
  const positionBeats = usePracticeStore((state) => state.positionBeats);
  const settings = usePracticeStore((state) => state.settings);
  const activeMidi = activeMidiAt(playbackEvents, positionBeats);
  const progress = score?.totalBeats ? (positionBeats / score.totalBeats) * 100 : 0;

  return (
    <main className="app-shell">
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
        <PianoKeyboard activeMidi={activeMidi} showNoteNames={settings.showNoteNames} />
      </section>
    </main>
  );
}

export default App;
