import { create } from "zustand";
import { preloadPianoEngine } from "../lib/audio/pianoEngine";
import { readMidiFile, parseMidi, midiToScoreModel } from "../lib/midi";
import { preloadOsmd } from "../lib/osmd";
import {
  buildPlaybackEvents,
  buildPlaybackSections,
  fetchMusicXml,
  parseMusicXml,
  readMusicXmlFile,
  type Hand,
  type PlaybackEvent,
  type ScoreModel,
} from "../lib/musicxml";

export type ViewMode = "river" | "score";
export type HandMode = "both" | "right" | "left";
export type AudioStatus = "idle" | "loading" | "ready" | "error";

export type RiverRange = {
  minMidi: number;
  maxMidi: number;
};

export type NoteColors = {
  left: string;
  right: string;
};

export type PracticeSettings = {
  viewMode: ViewMode;
  speed: number;
  riverZoom: number;
  riverRange: RiverRange;
  noteColors: NoteColors;
  showMeasureLines: boolean;
  loopEnabled: boolean;
  loopStartMeasure?: string;
  loopEndMeasure?: string;
  handMode: HandMode;
  volume: number;
  metronomeEnabled: boolean;
  showNoteNames: boolean;
};

type PracticeState = {
  score?: ScoreModel;
  playbackEvents: PlaybackEvent[];
  loadedName?: string;
  isLoading: boolean;
  loadError?: string;
  audioStatus: AudioStatus;
  audioError?: string;
  isPlaying: boolean;
  positionBeats: number;
  settings: PracticeSettings;
  loadXml: (xml: string, sourceName: string) => void;
  loadFile: (file: File) => Promise<void>;
  loadSample: (sampleId?: string) => Promise<void>;
  setPlaying: (isPlaying: boolean) => void;
  togglePlaying: () => void;
  setPosition: (positionBeats: number) => void;
  seekByMeasures: (delta: number) => void;
  preloadAudio: () => Promise<boolean>;
  setAudioError: (message?: string) => void;
  reset: () => void;
  updateSettings: (patch: Partial<PracticeSettings>) => void;
};

const SETTINGS_STORAGE_KEY = "clefline.practiceSettings.v1";

export const DEFAULT_NOTE_COLORS: NoteColors = {
  left: "#52c7e8",
  right: "#f7a56e",
};

const BASE_SETTINGS: PracticeSettings = {
  viewMode: "river",
  speed: 1,
  riverZoom: 1,
  riverRange: { minMidi: 21, maxMidi: 108 },
  noteColors: { ...DEFAULT_NOTE_COLORS },
  showMeasureLines: true,
  loopEnabled: false,
  handMode: "both",
  volume: 0.75,
  metronomeEnabled: false,
  showNoteNames: true,
};

type PersistedPracticeSettings = Pick<
  PracticeSettings,
  | "handMode"
  | "metronomeEnabled"
  | "noteColors"
  | "riverRange"
  | "riverZoom"
  | "showMeasureLines"
  | "showNoteNames"
  | "speed"
  | "viewMode"
  | "volume"
>;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function numberSetting(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function viewModeSetting(value: unknown, fallback: ViewMode): ViewMode {
  return value === "river" || value === "score" ? value : fallback;
}

function handModeSetting(value: unknown, fallback: HandMode): HandMode {
  return value === "both" || value === "right" || value === "left" ? value : fallback;
}

function riverRangeSetting(value: unknown, fallback: RiverRange): RiverRange {
  if (
    typeof value === "object" &&
    value !== null &&
    "minMidi" in value &&
    "maxMidi" in value &&
    typeof (value as RiverRange).minMidi === "number" &&
    typeof (value as RiverRange).maxMidi === "number"
  ) {
    const range = value as RiverRange;
    return {
      minMidi: Math.min(108, Math.max(21, range.minMidi)),
      maxMidi: Math.min(108, Math.max(21, range.maxMidi)),
    };
  }
  return fallback;
}

function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function noteColorsSetting(value: unknown, fallback: NoteColors): NoteColors {
  if (
    typeof value === "object" &&
    value !== null &&
    "left" in value &&
    "right" in value
  ) {
    const colors = value as NoteColors;
    return {
      left: isValidHexColor(colors.left) ? colors.left : fallback.left,
      right: isValidHexColor(colors.right) ? colors.right : fallback.right,
    };
  }
  return fallback;
}

function readPersistedSettings(): Partial<PersistedPracticeSettings> {
  const item = storage()?.getItem(SETTINGS_STORAGE_KEY);
  if (!item) {
    return {};
  }

  try {
    const data = JSON.parse(item) as Partial<PersistedPracticeSettings>;

    return {
      handMode: handModeSetting(data.handMode, BASE_SETTINGS.handMode),
      metronomeEnabled: booleanSetting(data.metronomeEnabled, BASE_SETTINGS.metronomeEnabled),
      noteColors: noteColorsSetting(data.noteColors, BASE_SETTINGS.noteColors),
      riverRange: riverRangeSetting(data.riverRange, BASE_SETTINGS.riverRange),
      riverZoom: numberSetting(data.riverZoom, BASE_SETTINGS.riverZoom, 0.1, 2),
      showMeasureLines: booleanSetting(data.showMeasureLines, BASE_SETTINGS.showMeasureLines),
      showNoteNames: booleanSetting(data.showNoteNames, BASE_SETTINGS.showNoteNames),
      speed: numberSetting(data.speed, BASE_SETTINGS.speed, 0.1, 2),
      viewMode: viewModeSetting(data.viewMode, BASE_SETTINGS.viewMode),
      volume: numberSetting(data.volume, BASE_SETTINGS.volume, 0, 1),
    };
  } catch {
    return {};
  }
}

function persistSettings(settings: PracticeSettings): void {
  try {
    storage()?.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        handMode: settings.handMode,
        metronomeEnabled: settings.metronomeEnabled,
        noteColors: settings.noteColors,
        riverRange: settings.riverRange,
        riverZoom: settings.riverZoom,
        showMeasureLines: settings.showMeasureLines,
        showNoteNames: settings.showNoteNames,
        speed: settings.speed,
        viewMode: settings.viewMode,
        volume: settings.volume,
      } satisfies PersistedPracticeSettings),
    );
  } catch {
    // Storage can be unavailable in private browsing or restricted iframes.
  }
}

function initialSettings(): PracticeSettings {
  return { ...BASE_SETTINGS, ...readPersistedSettings() };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function scoreLoadErrorMessage(sourceName: string, error: unknown): string {
  const message = errorMessage(error, "Failed to load file.");
  const lowerName = sourceName.toLowerCase();

  if (lowerName.endsWith(".mid") || lowerName.endsWith(".midi")) {
    return `MIDI load failed: ${message}`;
  }

  if (lowerName.endsWith(".mxl")) {
    return `MXL load failed: ${message}`;
  }

  if (/invalid musicxml|unsupported musicxml|playable part|score-partwise/i.test(message)) {
    return `MusicXML parse failed: ${message}`;
  }

  return `MusicXML load failed: ${message}`;
}

const ACTIVE_EVENT_LOOKBACK_BEATS = 16;
const measureByNumberCache = new WeakMap<ScoreModel, Map<string, ScoreModel["measures"][number]>>();
const performanceMeasuresCache = new WeakMap<
  ScoreModel,
  Array<{ absoluteBeat: number; measureIndex: number; number: string; sourceStartBeat: number }>
>();
const playbackStatsCache = new WeakMap<
  PlaybackEvent[],
  { endBeat: number; maxDurationBeats: number }
>();
const tempoChangesCache = new WeakMap<ScoreModel, Array<{ beat: number; tempo: number }>>();

function eventsFor(score: ScoreModel, handMode: HandMode): PlaybackEvent[] {
  return buildPlaybackEvents(score, { handMode });
}

function playableHand(handMode: HandMode): Hand | "both" {
  return handMode === "both" ? "both" : handMode;
}

export function initialTempo(score?: ScoreModel): number {
  return tempoAtSourceBeat(score, 0);
}

function tempoChanges(score: ScoreModel): Array<{ beat: number; tempo: number }> {
  const cached = tempoChangesCache.get(score);
  if (cached) {
    return cached;
  }

  const changes: Array<{ beat: number; tempo: number }> = [];
  for (const direction of score.directions) {
    if (direction.kind !== "tempo") {
      continue;
    }
    const tempo = Number(direction.value);
    if (Number.isFinite(tempo) && tempo > 0) {
      changes.push({ beat: direction.beat, tempo });
    }
  }
  changes.sort((first, second) => first.beat - second.beat);
  tempoChangesCache.set(score, changes);

  return changes;
}

export function tempoAtSourceBeat(score: ScoreModel | undefined, sourceBeat: number): number {
  if (!score) {
    return 120;
  }

  const changes = tempoChanges(score);
  if (changes.length === 0) {
    return 120;
  }

  let low = 0;
  let high = changes.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (changes[middle].beat <= Math.max(0, sourceBeat) + 0.0001) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const resolvedTempo = changes[match]?.tempo ?? changes[0]?.tempo ?? 120;

  return resolvedTempo;
}

export function tempoAtPlaybackBeat(
  score: ScoreModel | undefined,
  events: PlaybackEvent[],
  positionBeats: number,
): number {
  return tempoAtSourceBeat(score, sourceBeatAt(events, positionBeats));
}

function measureByNumber(score: ScoreModel, number: string | undefined) {
  if (!number) {
    return undefined;
  }

  let cache = measureByNumberCache.get(score);
  if (!cache) {
    cache = new Map(score.measures.map((measure) => [measure.number, measure]));
    measureByNumberCache.set(score, cache);
  }

  return cache.get(number);
}

export function loopBounds(score: ScoreModel | undefined, settings: PracticeSettings) {
  if (!score || !settings.loopEnabled) {
    return undefined;
  }

  const start = measureByNumber(score, settings.loopStartMeasure);
  const end = measureByNumber(score, settings.loopEndMeasure);
  if (!start || !end || end.startBeat < start.startBeat) {
    return undefined;
  }

  return {
    startBeat: start.startBeat,
    endBeat: end.startBeat + end.durationBeats,
  };
}

export function leadInBeats(score?: ScoreModel): number {
  return score ? Math.max(score.measures[0]?.durationBeats ?? 4, 1) : 0;
}

export function minimumPositionBeats(score?: ScoreModel): number {
  return score ? -leadInBeats(score) : 0;
}

export function playbackEndBeat(score: ScoreModel | undefined, events: PlaybackEvent[]): number {
  if (!score) {
    return 0;
  }

  return Math.max(0, playbackStats(events).endBeat || score.totalBeats);
}

function playbackStats(events: PlaybackEvent[]): { endBeat: number; maxDurationBeats: number } {
  const cached = playbackStatsCache.get(events);
  if (cached) {
    return cached;
  }

  let endBeat = 0;
  let maxDurationBeats = 0;
  for (const event of events) {
    endBeat = Math.max(endBeat, event.absoluteBeat + event.durationBeats);
    maxDurationBeats = Math.max(maxDurationBeats, event.durationBeats);
  }

  const stats = { endBeat, maxDurationBeats };
  playbackStatsCache.set(events, stats);

  return stats;
}

function eventIndexAtOrBefore(events: PlaybackEvent[], positionBeats: number): number {
  let low = 0;
  let high = events.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle].absoluteBeat <= positionBeats) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match;
}

function measureIndexAtOrBefore(score: ScoreModel, sourceBeat: number): number {
  let low = 0;
  let high = score.measures.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (score.measures[middle].startBeat <= sourceBeat) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return Math.max(0, match);
}

function performanceMeasures(score: ScoreModel) {
  const cached = performanceMeasuresCache.get(score);
  if (cached) {
    return cached;
  }

  const measures: Array<{
    absoluteBeat: number;
    measureIndex: number;
    number: string;
    sourceStartBeat: number;
  }> = [];

  for (const section of buildPlaybackSections(score)) {
    const startIndex = measureIndexAtOrBefore(score, section.sourceStartBeat);
    for (let index = startIndex; index < score.measures.length; index += 1) {
      const measure = score.measures[index];
      const measureEndBeat = measure.startBeat + measure.durationBeats;
      if (measure.startBeat >= section.sourceEndBeat) {
        break;
      }
      if (measureEndBeat <= section.sourceStartBeat) {
        continue;
      }

      const sourceStartBeat = Math.max(measure.startBeat, section.sourceStartBeat);
      measures.push({
        absoluteBeat: section.performanceStartBeat + (sourceStartBeat - section.sourceStartBeat),
        measureIndex: measure.index,
        number: measure.number,
        sourceStartBeat,
      });
    }
  }

  const sorted = measures.toSorted(
    (first, second) =>
      first.absoluteBeat - second.absoluteBeat || first.sourceStartBeat - second.sourceStartBeat,
  );
  performanceMeasuresCache.set(score, sorted);

  return sorted;
}

function performanceMeasureIndexAt(
  measures: Array<{ absoluteBeat: number }>,
  positionBeats: number,
): number {
  let low = 0;
  let high = measures.length - 1;
  let match = -1;
  const position = Math.max(0, positionBeats);

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (measures[middle].absoluteBeat <= position + 0.0001) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match;
}

function nextPerformanceMeasureIndex(
  measures: Array<{ absoluteBeat: number }>,
  positionBeats: number,
): number {
  let low = 0;
  let high = measures.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (measures[middle].absoluteBeat <= positionBeats + 0.001) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function targetMeasureIndex(
  measures: Array<{ absoluteBeat: number }>,
  positionBeats: number,
  delta: number,
): number {
  if (delta > 0) {
    return nextPerformanceMeasureIndex(measures, positionBeats) + delta - 1;
  }

  const currentIndex = performanceMeasureIndexAt(measures, positionBeats);
  if (currentIndex < 0) {
    return -1;
  }

  const currentStart = measures[currentIndex].absoluteBeat;
  const isNearMeasureStart = Math.abs(positionBeats - currentStart) <= 0.08;

  return currentIndex + delta + (isNearMeasureStart ? 0 : 1);
}

export function sourceBeatAt(events: PlaybackEvent[], positionBeats: number): number {
  if (positionBeats < 0 || events.length === 0) {
    return positionBeats;
  }

  const match = eventIndexAtOrBefore(events, positionBeats);
  if (match < 0) {
    return positionBeats;
  }

  const current = events[match];
  const next = events[match + 1];
  const delta = positionBeats - current.absoluteBeat;
  if (!next || next.absoluteBeat <= current.absoluteBeat) {
    return current.sourceStartBeat + delta;
  }

  const projected = current.sourceStartBeat + delta;
  if (next.sourceStartBeat >= current.sourceStartBeat) {
    return Math.min(projected, next.sourceStartBeat);
  }

  return projected;
}

function clampPosition(
  score: ScoreModel | undefined,
  events: PlaybackEvent[],
  positionBeats: number,
): number {
  const lower = minimumPositionBeats(score);
  const upper = playbackEndBeat(score, events);

  return Math.max(lower, Math.min(positionBeats, upper));
}

export function activePlaybackEventsAt(
  events: PlaybackEvent[],
  positionBeats: number,
): PlaybackEvent[] {
  const active: PlaybackEvent[] = [];
  const startIndex = eventIndexAtOrBefore(events, positionBeats);
  if (startIndex < 0) {
    return active;
  }

  const lowerBound =
    positionBeats - Math.max(ACTIVE_EVENT_LOOKBACK_BEATS, playbackStats(events).maxDurationBeats);
  for (let index = startIndex; index >= 0; index -= 1) {
    const event = events[index];
    if (event.absoluteBeat < lowerBound) {
      break;
    }
    if (event.absoluteBeat + Math.max(event.durationBeats, 0.1) <= positionBeats) {
      continue;
    }
    active.push(event);
  }

  return active.toReversed();
}

export function latestPlaybackEventAt(
  events: PlaybackEvent[],
  positionBeats: number,
): PlaybackEvent | undefined {
  const index = eventIndexAtOrBefore(events, positionBeats);

  return index >= 0 ? events[index] : undefined;
}

export function activeMidiAt(events: PlaybackEvent[], positionBeats: number): number[] {
  const active = new Set<number>();
  for (const event of activePlaybackEventsAt(events, positionBeats)) {
    for (const note of event.notes) {
      active.add(note.midi);
    }
  }

  return Array.from(active);
}

export function activeNotesAt(events: PlaybackEvent[], positionBeats: number) {
  const active: Array<{ midi: number; hand: Hand; pitchName: string }> = [];
  for (const event of activePlaybackEventsAt(events, positionBeats)) {
    for (const note of event.notes) {
      active.push({
        midi: note.midi,
        hand: note.hand,
        pitchName: note.pitchName,
      });
    }
  }

  return active;
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  playbackEvents: [],
  isLoading: false,
  audioStatus: "idle",
  isPlaying: false,
  positionBeats: 0,
  settings: initialSettings(),

  loadXml(xml, sourceName) {
    const score = parseMusicXml(xml);
    preloadOsmd();
    const firstMeasure = score.measures[0]?.number;
    const fourthMeasure = score.measures[Math.min(3, score.measures.length - 1)]?.number;
    const settings = {
      ...get().settings,
      loopEnabled: false,
      loopStartMeasure: firstMeasure,
      loopEndMeasure: fourthMeasure ?? firstMeasure,
    };
    set({
      score,
      loadedName: sourceName,
      settings,
      playbackEvents: eventsFor(score, settings.handMode),
      isLoading: false,
      loadError: undefined,
      isPlaying: false,
      positionBeats: minimumPositionBeats(score),
    });
  },

  async loadFile(file) {
    set({
      isLoading: true,
      loadError: undefined,
      isPlaying: false,
      positionBeats: minimumPositionBeats(get().score),
    });

    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "mid" || ext === "midi") {
      try {
        const loaded = await readMidiFile(file);
        const parsedMidi = parseMidi(loaded.arrayBuffer);
        const score = midiToScoreModel(parsedMidi, loaded.sourceName);
        const settings = {
          ...get().settings,
          loopEnabled: false,
          loopStartMeasure: score.measures[0]?.number,
          loopEndMeasure: score.measures[Math.min(3, score.measures.length - 1)]?.number,
        };
        preloadOsmd();
        set({
          score,
          loadedName: loaded.sourceName,
          settings,
          playbackEvents: eventsFor(score, settings.handMode),
          isLoading: false,
          loadError: undefined,
          isPlaying: false,
          positionBeats: minimumPositionBeats(score),
        });
      } catch (error) {
        set({
          isLoading: false,
          loadError: scoreLoadErrorMessage(file.name, error),
        });
      }
      return;
    }

    try {
      const loaded = await readMusicXmlFile(file);
      get().loadXml(loaded.xml, loaded.sourceName);
    } catch (error) {
      set({
        isLoading: false,
        loadError: scoreLoadErrorMessage(file.name, error),
      });
    }
  },

  async loadSample(sampleFile = "bach-minuet.mxl") {
    set({
      isLoading: true,
      loadError: undefined,
      isPlaying: false,
      positionBeats: minimumPositionBeats(get().score),
    });
    try {
      const loaded = await fetchMusicXml(`/samples/${sampleFile}`);
      get().loadXml(loaded.xml, sampleFile);
    } catch (error) {
      set({
        isLoading: false,
        loadError: scoreLoadErrorMessage(sampleFile, error),
      });
    }
  },

  setPlaying(isPlaying) {
    set({ isPlaying: isPlaying && Boolean(get().score) });
  },

  togglePlaying() {
    const { isPlaying, score } = get();
    set({ isPlaying: Boolean(score) && !isPlaying });
  },

  setPosition(positionBeats) {
    const { playbackEvents, score } = get();
    set({ positionBeats: clampPosition(score, playbackEvents, positionBeats) });
  },

  seekByMeasures(delta) {
    const { playbackEvents, positionBeats, score } = get();
    if (!score || delta === 0) {
      return;
    }

    const lower = minimumPositionBeats(score);
    if (positionBeats < 0 && delta > 0) {
      set({ positionBeats: 0 });
      return;
    }

    const measures = performanceMeasures(score);
    const nextIndex = targetMeasureIndex(measures, positionBeats, delta);
    const nextPosition =
      nextIndex < 0 ? lower : measures[Math.min(measures.length - 1, nextIndex)]?.absoluteBeat;
    set({
      positionBeats: clampPosition(score, playbackEvents, nextPosition ?? positionBeats),
    });
  },

  async preloadAudio() {
    const status = get().audioStatus;
    if (status === "ready") {
      return true;
    }
    if (status === "loading") {
      return false;
    }

    set({ audioStatus: "loading", audioError: undefined });
    try {
      await preloadPianoEngine();
      set({ audioStatus: "ready", audioError: undefined });
      return true;
    } catch (error) {
      set({
        audioStatus: "error",
        audioError: `Audio load failed: ${errorMessage(error, "Failed to load piano audio.")}`,
        isPlaying: false,
      });
      return false;
    }
  },

  setAudioError(message) {
    set({
      audioStatus: message ? "error" : "idle",
      audioError: message,
      isPlaying: false,
    });
  },

  reset() {
    const bounds = loopBounds(get().score, get().settings);
    set({
      positionBeats: bounds?.startBeat ?? minimumPositionBeats(get().score),
      isPlaying: false,
    });
  },

  updateSettings(patch) {
    const state = get();
    const nextSettings = { ...state.settings, ...patch };
    const score = state.score;
    const handModeChanged = patch.handMode !== undefined && patch.handMode !== state.settings.handMode;
    const playbackEvents = handModeChanged && score
      ? eventsFor(score, nextSettings.handMode)
      : state.playbackEvents;
    const bounds = loopBounds(score, nextSettings);
    const currentPosition = state.positionBeats;
    const positionBeats =
      bounds && (currentPosition < bounds.startBeat || currentPosition > bounds.endBeat)
        ? bounds.startBeat
        : clampPosition(score, playbackEvents, currentPosition);

    set({
      settings: nextSettings,
      playbackEvents,
      positionBeats,
    });
    persistSettings(nextSettings);
  },
}));

export function handModeLabel(handMode: HandMode): string {
  const hand = playableHand(handMode);

  return hand === "both" ? "Both hands" : hand === "right" ? "Right hand" : "Left hand";
}
