import {
  BookOpen,
  FileMusic,
  Info,
  Music2,
  PanelRight,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  SkipBack,
  SkipForward,
  Upload,
  Waves,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { ensurePianoEngine } from "../lib/audio/pianoEngine";
import {
  activeMidiAt,
  handModeLabel,
  initialTempo,
  loopBounds,
  sourceBeatAt,
  usePracticeStore,
} from "../store/practiceStore";
import type { PlaybackEvent } from "../lib/musicxml";

const EMPTY_PLAYBACK_EVENTS: PlaybackEvent[] = [];

export const Controls = memo(function Controls() {
  const [openPanel, setOpenPanel] = useState<"info" | "practice" | undefined>();
  const [audioLoading, setAudioLoading] = useState(false);
  const repeatDelayRef = useRef<number | undefined>(undefined);
  const repeatIntervalRef = useRef<number | undefined>(undefined);
  const score = usePracticeStore((state) => state.score);
  const loadedName = usePracticeStore((state) => state.loadedName);
  const isLoading = usePracticeStore((state) => state.isLoading);
  const loadError = usePracticeStore((state) => state.loadError);
  const isPlaying = usePracticeStore((state) => state.isPlaying);
  const playbackEvents = usePracticeStore((state) =>
    openPanel === "info" ? state.playbackEvents : EMPTY_PLAYBACK_EVENTS,
  );
  const positionBeats = usePracticeStore((state) =>
    openPanel === "info" ? state.positionBeats : 0,
  );
  const settings = usePracticeStore((state) => state.settings);
  const loadFile = usePracticeStore((state) => state.loadFile);
  const loadSample = usePracticeStore((state) => state.loadSample);
  const togglePlaying = usePracticeStore((state) => state.togglePlaying);
  const reset = usePracticeStore((state) => state.reset);
  const seekByMeasures = usePracticeStore((state) => state.seekByMeasures);
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
    sourceBeatAt(playbackEvents, positionBeats) < 0
      ? "0"
      : (score?.measures.findLast(
          (measure) => measure.startBeat <= sourceBeatAt(playbackEvents, positionBeats),
        )?.number ?? "1");
  const onPlayClick = async () => {
    if (isPlaying) {
      togglePlaying();
      return;
    }

    setAudioLoading(true);
    try {
      await ensurePianoEngine();
      togglePlaying();
    } finally {
      setAudioLoading(false);
    }
  };
  const stopMeasureRepeat = useCallback(() => {
    if (repeatDelayRef.current !== undefined) {
      window.clearTimeout(repeatDelayRef.current);
      repeatDelayRef.current = undefined;
    }
    if (repeatIntervalRef.current !== undefined) {
      window.clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = undefined;
    }
  }, []);
  const startMeasureRepeat = useCallback(
    (delta: number) => {
      stopMeasureRepeat();
      seekByMeasures(delta);
      repeatDelayRef.current = window.setTimeout(() => {
        repeatIntervalRef.current = window.setInterval(() => seekByMeasures(delta), 130);
      }, 330);
    },
    [seekByMeasures, stopMeasureRepeat],
  );
  const onMeasureButtonKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, delta: number) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      seekByMeasures(delta);
    },
    [seekByMeasures],
  );

  useEffect(() => stopMeasureRepeat, [stopMeasureRepeat]);

  return (
    <>
      <header className="topbar">
        <div className="brand-block">
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
          <button
            type="button"
            className="round-button"
            onClick={() => void onPlayClick()}
            disabled={!score || audioLoading}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button type="button" className="round-button" onClick={reset} disabled={!score}>
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            className="round-button"
            onBlur={stopMeasureRepeat}
            disabled={!score}
            aria-label="Previous measure"
            onKeyDown={(event) => onMeasureButtonKeyDown(event, -1)}
            onPointerCancel={stopMeasureRepeat}
            onPointerDown={(event) => {
              event.preventDefault();
              startMeasureRepeat(-1);
            }}
            onPointerLeave={stopMeasureRepeat}
            onPointerUp={stopMeasureRepeat}
            title="Previous measure"
          >
            <SkipBack size={17} />
          </button>
          <button
            type="button"
            className="round-button"
            onBlur={stopMeasureRepeat}
            disabled={!score}
            aria-label="Next measure"
            onKeyDown={(event) => onMeasureButtonKeyDown(event, 1)}
            onPointerCancel={stopMeasureRepeat}
            onPointerDown={(event) => {
              event.preventDefault();
              startMeasureRepeat(1);
            }}
            onPointerLeave={stopMeasureRepeat}
            onPointerUp={stopMeasureRepeat}
            title="Next measure"
          >
            <SkipForward size={17} />
          </button>
          <div className="segmented compact" aria-label="View mode">
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
          <button
            type="button"
            className="icon-button"
            onClick={() => setOpenPanel(openPanel === "practice" ? undefined : "practice")}
          >
            <SlidersHorizontal size={17} />
            Practice
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setOpenPanel(openPanel === "info" ? undefined : "info")}
          >
            <Info size={17} />
            Info
          </button>
        </div>
      </header>
      {loadError ? <div className="toast-error">{loadError}</div> : null}
      {isLoading || audioLoading ? (
        <div className="toast-info">{audioLoading ? "Loading piano..." : "Loading score..."}</div>
      ) : null}
      {openPanel ? (
        <button
          type="button"
          aria-label="Close options backdrop"
          className="side-backdrop"
          onClick={() => setOpenPanel(undefined)}
        />
      ) : null}
      <aside className={openPanel ? "side-panel open" : "side-panel"} aria-label="Options panel">
        <div className="side-panel-header">
          <span>{openPanel === "info" ? "Score info" : "Practice"}</span>
          <button
            type="button"
            aria-label="Close options"
            className="round-button"
            onClick={() => setOpenPanel(undefined)}
          >
            <X size={17} />
          </button>
        </div>
        {openPanel === "info" ? (
          <div className="panel-stack">
            <div className="panel-card">
              <strong>{loadedName ?? "No score loaded"}</strong>
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
                </>
              ) : null}
            </div>
            {score?.warnings.map((warning) => (
              <div className="panel-warning" key={`${warning.code}-${warning.measureNumber}`}>
                <strong>{warning.code}</strong>
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        ) : null}
        {openPanel === "practice" ? (
          <div className="panel-stack">
            <label className="slider-control stacked">
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
            <label className="slider-control stacked">
              River zoom
              <input
                max="2"
                min="0.6"
                step="0.1"
                type="range"
                value={settings.riverZoom}
                onChange={(event) => updateSettings({ riverZoom: Number(event.target.value) })}
              />
              <span>{Math.round(settings.riverZoom * 100)}%</span>
            </label>
            <label className="slider-control stacked">
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
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={settings.metronomeEnabled}
                onChange={(event) => updateSettings({ metronomeEnabled: event.target.checked })}
              />
              Metronome
            </label>
            <div className="range-row">
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
            </div>
            <div className="segmented wrapped" aria-label="Hand mode">
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
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={settings.showMeasureLines}
                onChange={(event) => updateSettings({ showMeasureLines: event.target.checked })}
              />
              Measure lines
            </label>
          </div>
        ) : null}
      </aside>
      <div className="sidebar-edge" aria-hidden="true">
        <PanelRight size={14} />
      </div>
    </>
  );
});
