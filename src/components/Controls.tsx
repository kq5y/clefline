import {
  BookOpen,
  ExternalLink,
  Info,
  Maximize,
  Minimize,
  Music2,
  PanelRight,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  SkipBack,
  SkipForward,
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
  type PointerEvent,
} from "react";
import { ensurePianoEngine } from "../lib/audio/pianoEngine";
import {
  activeMidiAt,
  DEFAULT_NOTE_COLORS,
  handModeLabel,
  initialTempo,
  loopBounds,
  sourceBeatAt,
  usePracticeStore,
} from "../store/practiceStore";
import type { PlaybackEvent, ScoreModel } from "../lib/musicxml";

const EMPTY_PLAYBACK_EVENTS: PlaybackEvent[] = [];
const UNTITLED_SCORE = "Untitled Score";

function titleFromSourceName(sourceName: string | undefined): string | undefined {
  const stem = sourceName
    ?.split("/")
    .pop()
    ?.replace(/\.(musicxml|mxl|xml|mid|midi)$/i, "")
    .trim();
  if (!stem) {
    return undefined;
  }

  return stem
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayScoreTitle(score: ScoreModel | undefined, sourceName?: string) {
  const title = score?.metadata.title?.trim();
  if (title && title !== UNTITLED_SCORE) {
    return title;
  }

  return titleFromSourceName(sourceName) ?? score?.metadata.partName?.trim() ?? "Clefline";
}

function blurPointerButton(event: PointerEvent<HTMLElement>): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest("button");
  if (button && event.currentTarget.contains(button)) {
    button.blur();
  }
}

export const Controls = memo(function Controls() {
  const [openPanel, setOpenPanel] = useState<"info" | "practice" | undefined>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const repeatDelayRef = useRef<number | undefined>(undefined);
  const repeatIntervalRef = useRef<number | undefined>(undefined);
  const score = usePracticeStore((state) => state.score);
  const loadedName = usePracticeStore((state) => state.loadedName);
  const isLoading = usePracticeStore((state) => state.isLoading);
  const loadError = usePracticeStore((state) => state.loadError);
  const audioStatus = usePracticeStore((state) => state.audioStatus);
  const audioError = usePracticeStore((state) => state.audioError);
  const isPlaying = usePracticeStore((state) => state.isPlaying);
  const playbackEvents = usePracticeStore((state) =>
    openPanel === "info" ? state.playbackEvents : EMPTY_PLAYBACK_EVENTS,
  );
  const positionBeats = usePracticeStore((state) =>
    openPanel === "info" ? state.positionBeats : 0,
  );
  const settings = usePracticeStore((state) => state.settings);
  const loadFile = usePracticeStore((state) => state.loadFile);
  const togglePlaying = usePracticeStore((state) => state.togglePlaying);
  const preloadAudio = usePracticeStore((state) => state.preloadAudio);
  const setAudioError = usePracticeStore((state) => state.setAudioError);
  const reset = usePracticeStore((state) => state.reset);
  const seekByMeasures = usePracticeStore((state) => state.seekByMeasures);
  const updateSettings = usePracticeStore((state) => state.updateSettings);
  const displayTitle = displayScoreTitle(score, loadedName);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void loadFile(file);
    }
    event.target.value = "";
  };
  const activeNotes = activeMidiAt(playbackEvents, positionBeats).length;
  const loop = loopBounds(score, settings);
  const sourceBeat = sourceBeatAt(playbackEvents, positionBeats);
  const currentMeasure =
    sourceBeat < 0
      ? "0"
      : (score?.measures.findLast((measure) => measure.startBeat <= sourceBeat)?.number ?? "1");
  const onPlayClick = async () => {
    if (isPlaying) {
      togglePlaying();
      return;
    }

    const ready = audioStatus === "ready" || (await preloadAudio());
    if (!ready) {
      return;
    }

    try {
      await ensurePianoEngine();
      togglePlaying();
    } catch (error) {
      setAudioError(
        `Audio start failed: ${
          error instanceof Error ? error.message : "Failed to start piano audio."
        }`,
      );
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

  useEffect(() => {
    if (score && audioStatus !== "ready" && audioStatus !== "loading") {
      void preloadAudio();
    }
  }, [audioStatus, preloadAudio, score]);

  useEffect(() => {
    if (!openPanel) {
      return undefined;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPanel(undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openPanel]);

  useEffect(() => stopMeasureRepeat, [stopMeasureRepeat]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  }, []);

  return (
    <>
      <header className="topbar" onPointerUpCapture={blurPointerButton}>
        <div className="brand-block">
          <label className="title-file-picker">
            <h1>{displayTitle}</h1>
            <input accept=".musicxml,.xml,.mxl,.mid,.midi" type="file" onChange={onFileChange} />
          </label>
        </div>
        <div className="file-actions">
          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            className="round-button"
            onClick={() => void onPlayClick()}
            disabled={!score || audioStatus === "loading"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            type="button"
            aria-label="Restart score"
            className="round-button"
            onClick={reset}
            disabled={!score}
          >
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
              Roll
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
            aria-controls="options-panel"
            aria-expanded={openPanel === "practice"}
            onClick={() => setOpenPanel(openPanel === "practice" ? undefined : "practice")}
          >
            <SlidersHorizontal size={17} />
            Practice
          </button>
          <button
            type="button"
            className="round-button"
            aria-label="Score info"
            aria-controls="options-panel"
            aria-expanded={openPanel === "info"}
            onClick={() => setOpenPanel(openPanel === "info" ? undefined : "info")}
          >
            <Info size={17} />
          </button>
          <button
            type="button"
            className="round-button"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
        </div>
      </header>
      {loadError || audioError ? (
        <div className="toast-error" role="alert">
          {loadError ?? audioError}
        </div>
      ) : null}
      {isLoading || audioStatus === "loading" ? (
        <div className="toast-info" role="status" aria-live="polite">
          {audioStatus === "loading" ? "Loading piano..." : "Loading score..."}
        </div>
      ) : null}
      {openPanel ? (
        <button
          type="button"
          aria-label="Close options backdrop"
          className="side-backdrop"
          onClick={() => setOpenPanel(undefined)}
        />
      ) : null}
      <aside
        id="options-panel"
        className={openPanel ? "side-panel open" : "side-panel"}
        aria-hidden={!openPanel}
        aria-label="Options panel"
        inert={!openPanel}
      >
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
            <div className="panel-card">
              <strong>Shortcuts</strong>
              <span>Space: Play / Pause</span>
              <span>Left / Right: Previous / Next measure</span>
              <span>Hold Left / Right: Repeat measure movement</span>
              <span>Esc: Close this panel</span>
            </div>
            <a
              className="panel-link"
              href="https://github.com/kq5y/clefline"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={13} />
              Contribute on GitHub
            </a>
          </div>
        ) : null}
        {openPanel === "practice" ? (
          <div className="panel-stack">
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
            <label className="slider-control stacked">
              Speed
              <input
                max="2"
                min="0.1"
                step="0.05"
                type="range"
                value={settings.speed}
                onChange={(event) => updateSettings({ speed: Number(event.target.value) })}
              />
              <span>{Math.round(settings.speed * 100)}%</span>
            </label>
            <label className="slider-control stacked">
              Roll zoom
              <input
                max="2"
                min="0.1"
                step="0.1"
                type="range"
                value={settings.riverZoom}
                onChange={(event) => updateSettings({ riverZoom: Number(event.target.value) })}
              />
              <span>{Math.round(settings.riverZoom * 100)}%</span>
            </label>
            <label className="slider-control stacked">
              Roll range (low)
              <input
                max="108"
                min="21"
                step="1"
                type="range"
                value={settings.riverRange.minMidi}
                onChange={(event) =>
                  updateSettings({
                    riverRange: {
                      ...settings.riverRange,
                      minMidi: Math.min(Number(event.target.value), settings.riverRange.maxMidi - 12),
                    },
                  })
                }
              />
              <span>MIDI {settings.riverRange.minMidi}</span>
            </label>
            <label className="slider-control stacked">
              Roll range (high)
              <input
                max="108"
                min="21"
                step="1"
                type="range"
                value={settings.riverRange.maxMidi}
                onChange={(event) =>
                  updateSettings({
                    riverRange: {
                      ...settings.riverRange,
                      maxMidi: Math.max(Number(event.target.value), settings.riverRange.minMidi + 12),
                    },
                  })
                }
              />
              <span>MIDI {settings.riverRange.maxMidi}</span>
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
                checked={settings.metronomeEnabled}
                onChange={(event) => updateSettings({ metronomeEnabled: event.target.checked })}
              />
              Metronome
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
            <div className="color-row">
              <label className="color-control">
                Left
                <input
                  type="color"
                  value={settings.noteColors.left}
                  onChange={(event) =>
                    updateSettings({
                      noteColors: { ...settings.noteColors, left: event.target.value },
                    })
                  }
                />
              </label>
              <label className="color-control">
                Right
                <input
                  type="color"
                  value={settings.noteColors.right}
                  onChange={(event) =>
                    updateSettings({
                      noteColors: { ...settings.noteColors, right: event.target.value },
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="reset-colors-button"
                onClick={() => updateSettings({ noteColors: { ...DEFAULT_NOTE_COLORS } })}
                title="Reset colors"
              >
                <RotateCw size={14} />
              </button>
            </div>
          </div>
        ) : null}
      </aside>
      <div className="sidebar-edge" aria-hidden="true">
        <PanelRight size={14} />
      </div>
    </>
  );
});
