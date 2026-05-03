import { create } from "zustand";
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

export type PracticeSettings = {
  viewMode: ViewMode;
  speed: number;
  riverZoom: number;
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
  isPlaying: boolean;
  positionBeats: number;
  settings: PracticeSettings;
  loadXml: (xml: string, sourceName: string) => void;
  loadFile: (file: File) => Promise<void>;
  loadSample: () => Promise<void>;
  setPlaying: (isPlaying: boolean) => void;
  togglePlaying: () => void;
  setPosition: (positionBeats: number) => void;
  seekByMeasures: (delta: number) => void;
  reset: () => void;
  updateSettings: (patch: Partial<PracticeSettings>) => void;
};

const DEFAULT_SETTINGS: PracticeSettings = {
  viewMode: "river",
  speed: 1,
  riverZoom: 1,
  showMeasureLines: true,
  loopEnabled: false,
  handMode: "both",
  volume: 0.75,
  metronomeEnabled: false,
  showNoteNames: true,
};

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

  const changes = score.directions
    .filter((direction) => direction.kind === "tempo")
    .flatMap((direction) => {
      const tempo = Number(direction.value);

      return Number.isFinite(tempo) && tempo > 0 ? [{ beat: direction.beat, tempo }] : [];
    })
    .toSorted((first, second) => first.beat - second.beat);
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
  isPlaying: false,
  positionBeats: 0,
  settings: DEFAULT_SETTINGS,

  loadXml(xml, sourceName) {
    const score = parseMusicXml(xml);
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
    try {
      const loaded = await readMusicXmlFile(file);
      get().loadXml(loaded.xml, loaded.sourceName);
    } catch (error) {
      set({
        isLoading: false,
        loadError: error instanceof Error ? error.message : "Failed to load MusicXML.",
      });
    }
  },

  async loadSample() {
    set({
      isLoading: true,
      loadError: undefined,
      isPlaying: false,
      positionBeats: minimumPositionBeats(get().score),
    });
    try {
      const loaded = await fetchMusicXml("/samples/bach-minuet.musicxml");
      get().loadXml(loaded.xml, "bach-minuet.musicxml");
    } catch (error) {
      set({
        isLoading: false,
        loadError: error instanceof Error ? error.message : "Failed to load the sample score.",
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
    const currentIndex = performanceMeasureIndexAt(measures, positionBeats);
    const nextIndex = currentIndex + delta;
    const nextPosition =
      nextIndex < 0 ? lower : measures[Math.min(measures.length - 1, nextIndex)]?.absoluteBeat;
    set({
      positionBeats: clampPosition(score, playbackEvents, nextPosition ?? positionBeats),
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
    const nextSettings = { ...get().settings, ...patch };
    const score = get().score;
    const playbackEvents = score ? eventsFor(score, nextSettings.handMode) : [];
    const bounds = loopBounds(score, nextSettings);
    const currentPosition = get().positionBeats;
    const positionBeats =
      bounds && (currentPosition < bounds.startBeat || currentPosition > bounds.endBeat)
        ? bounds.startBeat
        : clampPosition(score, playbackEvents, currentPosition);

    set({
      settings: nextSettings,
      playbackEvents,
      positionBeats,
    });
  },
}));

export function handModeLabel(handMode: HandMode): string {
  const hand = playableHand(handMode);

  return hand === "both" ? "Both hands" : hand === "right" ? "Right hand" : "Left hand";
}
