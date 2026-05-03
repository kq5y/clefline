import { create } from "zustand";
import {
  buildPlaybackEvents,
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

function eventsFor(score: ScoreModel, handMode: HandMode): PlaybackEvent[] {
  return buildPlaybackEvents(score, { handMode });
}

function playableHand(handMode: HandMode): Hand | "both" {
  return handMode === "both" ? "both" : handMode;
}

export function initialTempo(score?: ScoreModel): number {
  const tempo = score?.directions.find((direction) => direction.kind === "tempo")?.value;

  return typeof tempo === "number" && Number.isFinite(tempo) && tempo > 0 ? tempo : 120;
}

export function loopBounds(score: ScoreModel | undefined, settings: PracticeSettings) {
  if (!score || !settings.loopEnabled) {
    return undefined;
  }

  const start = score.measures.find((measure) => measure.number === settings.loopStartMeasure);
  const end = score.measures.find((measure) => measure.number === settings.loopEndMeasure);
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

  const eventEnd = events.reduce(
    (endBeat, event) => Math.max(endBeat, event.absoluteBeat + event.durationBeats),
    0,
  );

  return Math.max(0, eventEnd || score.totalBeats);
}

export function sourceBeatAt(events: PlaybackEvent[], positionBeats: number): number {
  if (positionBeats < 0 || events.length === 0) {
    return positionBeats;
  }

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

export function activeMidiAt(events: PlaybackEvent[], positionBeats: number): number[] {
  const active = new Set<number>();
  for (const event of events) {
    if (event.absoluteBeat > positionBeats) {
      break;
    }
    if (event.absoluteBeat + Math.max(event.durationBeats, 0.1) <= positionBeats) {
      continue;
    }
    for (const note of event.notes) {
      active.add(note.midi);
    }
  }

  return Array.from(active);
}

export function activeNotesAt(events: PlaybackEvent[], positionBeats: number) {
  const active: Array<{ midi: number; hand: Hand; pitchName: string }> = [];
  for (const event of events) {
    if (event.absoluteBeat > positionBeats) {
      break;
    }
    if (event.absoluteBeat + Math.max(event.durationBeats, 0.1) <= positionBeats) {
      continue;
    }
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
      loopStartMeasure: get().settings.loopStartMeasure ?? firstMeasure,
      loopEndMeasure: get().settings.loopEndMeasure ?? fourthMeasure ?? firstMeasure,
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
    set({ isLoading: true, loadError: undefined });
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
    set({ isLoading: true, loadError: undefined });
    try {
      const loaded = await fetchMusicXml("/samples/sample_science.musicxml");
      get().loadXml(loaded.xml, "sample_science.musicxml");
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
    const score = get().score;
    if (!score || delta === 0) {
      return;
    }

    const currentPosition = sourceBeatAt(get().playbackEvents, get().positionBeats);
    const lower = minimumPositionBeats(score);
    if (currentPosition < 0 && delta > 0) {
      set({ positionBeats: 0 });
      return;
    }

    const currentIndex = score.measures.findLastIndex(
      (measure) => measure.startBeat <= Math.max(0, currentPosition),
    );
    const nextIndex = currentIndex + delta;
    const nextPosition =
      nextIndex < 0
        ? lower
        : score.measures[Math.min(score.measures.length - 1, nextIndex)]?.startBeat;
    set({
      positionBeats: clampPosition(score, get().playbackEvents, nextPosition ?? currentPosition),
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
