import { buildPlaybackSections, type PlaybackSection } from "./timeline";
import type { ScoreModel } from "./types";

export type PerformanceMeasure = {
  absoluteBeat: number;
  durationBeats: number;
  measureIndex: number;
  number: string;
  sourceStartBeat: number;
};

const sectionsCache = new WeakMap<ScoreModel, PlaybackSection[]>();
const performanceMeasuresCache = new WeakMap<ScoreModel, PerformanceMeasure[]>();

const EPSILON = 0.0001;

export function playbackSectionsFor(score: ScoreModel): PlaybackSection[] {
  let sections = sectionsCache.get(score);
  if (!sections) {
    sections = buildPlaybackSections(score);
    sectionsCache.set(score, sections);
  }

  return sections;
}

function sectionBeats(section: PlaybackSection): number {
  return section.sourceEndBeat - section.sourceStartBeat;
}

export function sectionIndexAtPerformanceBeat(
  sections: PlaybackSection[],
  performanceBeat: number,
): number {
  let low = 0;
  let high = sections.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (sections[middle].performanceStartBeat <= performanceBeat + EPSILON) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match;
}

/**
 * Maps a beat on the expanded performance timeline back to the beat in the
 * source score, following repeat and navigation expansion.
 */
export function sourceBeatAtPerformanceBeat(
  score: ScoreModel | undefined,
  performanceBeat: number,
): number {
  if (!score || performanceBeat < 0) {
    return performanceBeat;
  }

  const sections = playbackSectionsFor(score);
  const index = sectionIndexAtPerformanceBeat(sections, performanceBeat);
  if (index < 0) {
    return performanceBeat;
  }

  const section = sections[index];
  const offset = Math.min(
    Math.max(0, performanceBeat - section.performanceStartBeat),
    sectionBeats(section),
  );

  return section.sourceStartBeat + offset;
}

/**
 * Maps a beat in the source score onto the expanded performance timeline. A
 * source beat can be played several times, so the pass closest to
 * `nearPerformanceBeat` wins.
 */
export function performanceBeatAtSourceBeat(
  score: ScoreModel | undefined,
  sourceBeat: number,
  nearPerformanceBeat = 0,
): number {
  if (!score || sourceBeat < 0) {
    return sourceBeat;
  }

  const sections = playbackSectionsFor(score);
  let best: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const section of sections) {
    const clamped = Math.min(Math.max(sourceBeat, section.sourceStartBeat), section.sourceEndBeat);
    const candidate = section.performanceStartBeat + (clamped - section.sourceStartBeat);
    const plays =
      sourceBeat >= section.sourceStartBeat - EPSILON &&
      sourceBeat < section.sourceEndBeat - EPSILON;
    const penalty = plays ? 0 : 1 + Math.abs(clamped - sourceBeat);
    const distance = penalty * 1000 + Math.abs(candidate - nearPerformanceBeat);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best ?? sourceBeat;
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

/**
 * Every measure as it appears on the expanded performance timeline, including
 * the extra passes created by repeats and navigation jumps.
 */
export function performanceMeasures(score: ScoreModel): PerformanceMeasure[] {
  const cached = performanceMeasuresCache.get(score);
  if (cached) {
    return cached;
  }

  const measures: PerformanceMeasure[] = [];

  for (const section of playbackSectionsFor(score)) {
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
        durationBeats: Math.min(measureEndBeat, section.sourceEndBeat) - sourceStartBeat,
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
