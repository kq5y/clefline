import { BookOpen, FileMusic, Music2, Pause, Play, RotateCcw, Upload, Waves } from "lucide-react";
import type { ChangeEvent } from "react";
import {
  activeMidiAt,
  handModeLabel,
  initialTempo,
  loopBounds,
  usePracticeStore,
} from "../store/practiceStore";

export function Controls() {
  const score = usePracticeStore((state) => state.score);
  const loadedName = usePracticeStore((state) => state.loadedName);
  const isLoading = usePracticeStore((state) => state.isLoading);
  const loadError = usePracticeStore((state) => state.loadError);
  const isPlaying = usePracticeStore((state) => state.isPlaying);
  const playbackEvents = usePracticeStore((state) => state.playbackEvents);
  const positionBeats = usePracticeStore((state) => state.positionBeats);
  const settings = usePracticeStore((state) => state.settings);
  const loadFile = usePracticeStore((state) => state.loadFile);
  const loadSample = usePracticeStore((state) => state.loadSample);
  const togglePlaying = usePracticeStore((state) => state.togglePlaying);
  const reset = usePracticeStore((state) => state.reset);
  const updateSettings = usePracticeStore((state) => state.updateSettings);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void loadFile(file);
    }
    event.target.value = "";
  };
  const activeNotes = activeMidiAt(playbackEvents, positionBeats).length;
  const loop = loopBounds(score, settings);
  const currentMeasure =
    score?.measures.findLast((measure) => measure.startBeat <= positionBeats)?.number ?? "1";

  return (
    <>
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">MusicXML piano practice</p>
          <h1>Piano River</h1>
        </div>
        <div className="file-actions">
          <button type="button" className="icon-button" onClick={() => void loadSample()}>
            <FileMusic size={17} />
            Science sample
          </button>
          <label className="icon-button file-picker">
            <Upload size={17} />
            Load MusicXML
            <input accept=".musicxml,.xml,.mxl" type="file" onChange={onFileChange} />
          </label>
        </div>
      </header>
      <section className="status-strip" aria-live="polite">
        <span>{isLoading ? "Loading score..." : loadedName ? loadedName : "No score loaded"}</span>
        {score ? (
          <>
            <span>{score.measures.length} measures</span>
            <span>{Math.round(initialTempo(score))} BPM</span>
            <span>Measure {currentMeasure}</span>
            <span>{handModeLabel(settings.handMode)}</span>
            <span>{activeNotes} active notes</span>
            {loop ? (
              <span>
                Loop {settings.loopStartMeasure}-{settings.loopEndMeasure}
              </span>
            ) : null}
            {score.warnings.length > 0 ? (
              <strong>{score.warnings.length} score warnings</strong>
            ) : null}
          </>
        ) : null}
        {loadError ? <strong>{loadError}</strong> : null}
      </section>
      <section className="transport" aria-label="Practice controls">
        <div className="button-cluster">
          <button type="button" className="round-button" onClick={togglePlaying} disabled={!score}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button type="button" className="round-button" onClick={reset} disabled={!score}>
            <RotateCcw size={18} />
          </button>
        </div>
        <div className="segmented" aria-label="View mode">
          <button
            type="button"
            className={settings.viewMode === "river" ? "selected" : ""}
            onClick={() => updateSettings({ viewMode: "river" })}
          >
            <Waves size={15} />
            River
          </button>
          <button
            type="button"
            className={settings.viewMode === "score" ? "selected" : ""}
            onClick={() => updateSettings({ viewMode: "score" })}
          >
            <BookOpen size={15} />
            Score
          </button>
        </div>
        <label className="slider-control">
          Speed
          <input
            max="1.25"
            min="0.25"
            step="0.05"
            type="range"
            value={settings.speed}
            onChange={(event) => updateSettings({ speed: Number(event.target.value) })}
          />
          <span>{Math.round(settings.speed * 100)}%</span>
        </label>
        <label className="slider-control">
          Volume
          <input
            max="1"
            min="0"
            step="0.05"
            type="range"
            value={settings.volume}
            onChange={(event) => updateSettings({ volume: Number(event.target.value) })}
          />
          <span>{Math.round(settings.volume * 100)}%</span>
        </label>
        <label className="toggle-control">
          <input
            type="checkbox"
            checked={settings.loopEnabled}
            disabled={!score}
            onChange={(event) => updateSettings({ loopEnabled: event.target.checked })}
          />
          Loop
        </label>
        <label className="select-control">
          A
          <select
            disabled={!score}
            value={settings.loopStartMeasure ?? ""}
            onChange={(event) => updateSettings({ loopStartMeasure: event.target.value })}
          >
            {score?.measures.map((measure) => (
              <option key={measure.index} value={measure.number}>
                {measure.number}
              </option>
            ))}
          </select>
        </label>
        <label className="select-control">
          B
          <select
            disabled={!score}
            value={settings.loopEndMeasure ?? ""}
            onChange={(event) => updateSettings({ loopEndMeasure: event.target.value })}
          >
            {score?.measures.map((measure) => (
              <option key={measure.index} value={measure.number}>
                {measure.number}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" aria-label="Hand mode">
          {(["both", "right", "left"] as const).map((handMode) => (
            <button
              type="button"
              className={settings.handMode === handMode ? "selected" : ""}
              key={handMode}
              onClick={() => updateSettings({ handMode })}
            >
              <Music2 size={15} />
              {handMode === "both" ? "Both" : handMode === "right" ? "Right" : "Left"}
            </button>
          ))}
        </div>
        <label className="toggle-control">
          <input
            type="checkbox"
            checked={settings.showNoteNames}
            onChange={(event) => updateSettings({ showNoteNames: event.target.checked })}
          />
          Names
        </label>
      </section>
    </>
  );
}
