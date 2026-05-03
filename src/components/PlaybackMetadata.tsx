import { memo, useEffect, useRef, useState, type RefObject } from "react";
import {
  activePlaybackEventsAt,
  latestPlaybackEventAt,
  sourceBeatAt,
  tempoAtSourceBeat,
  usePracticeStore,
} from "../store/practiceStore";
import type { DirectionEvent, PlaybackEvent, ScoreModel } from "../lib/musicxml";

const DYNAMIC_LABELS = new Set(["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"]);
const ARTICULATION_LABELS: Record<string, string> = {
  accent: "Accent",
  arpeggiate: "Arp.",
  grace: "Grace",
  glissando: "Gliss.",
  slide: "Slide",
  staccatissimo: "Stacc.",
  staccato: "Stacc.",
  "strong-accent": "Marc.",
  tenuto: "Tenuto",
};
type PracticeSnapshot = ReturnType<typeof usePracticeStore.getState>;
type Metadata = {
  dynamic: string;
  expression: string;
  labels: string;
  measure: string;
  tempo: string;
  velocity: string;
};

function directionText(direction: DirectionEvent | undefined): string | undefined {
  const value = direction?.text ?? direction?.value;

  return value === undefined ? undefined : String(value);
}

function currentDynamic(score: ScoreModel, positionBeats: number): string {
  const direction = directionAt(score, positionBeats, (item) => item.kind === "dynamic");
  const text = directionText(direction)?.toLowerCase();
  if (!text) {
    return "-";
  }
  if (DYNAMIC_LABELS.has(text)) {
    return text;
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}` : text;
}

function currentExpression(score: ScoreModel, positionBeats: number): string | undefined {
  const wedge = directionAt(score, positionBeats, (item) => item.kind === "wedge");
  const text = directionText(wedge)?.toLowerCase();
  if (!text || text === "stop") {
    return undefined;
  }

  return text.includes("diminuendo") ? "Dim." : text.includes("crescendo") ? "Cresc." : text;
}

function directionAt(
  score: ScoreModel,
  beat: number,
  predicate: (direction: DirectionEvent) => boolean,
): DirectionEvent | undefined {
  let low = 0;
  let high = score.directions.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (score.directions[middle].beat <= beat) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  for (let index = match; index >= 0; index -= 1) {
    const direction = score.directions[index];
    if (predicate(direction)) {
      return direction;
    }
  }

  return undefined;
}

function measureNumberAt(score: ScoreModel, beat: number): string {
  if (beat < 0) {
    return "0";
  }

  let low = 0;
  let high = score.measures.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (score.measures[middle].startBeat <= beat) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return score.measures[match]?.number ?? "1";
}

function eventLabels(events: PlaybackEvent[]): string {
  if (events.length === 0) {
    return "-";
  }

  const labels = new Set<string>();
  for (const event of events) {
    for (const label of event.notationLabels) {
      const displayLabel = ARTICULATION_LABELS[label];
      if (displayLabel) {
        labels.add(displayLabel);
      }
      if (labels.size >= 3) {
        return Array.from(labels).join(", ");
      }
    }
  }

  return labels.size > 0 ? Array.from(labels).join(", ") : "-";
}

function metadataForState(state: PracticeSnapshot): Metadata | undefined {
  const { playbackEvents, positionBeats, score } = state;
  if (!score) {
    return undefined;
  }

  const sourcePositionBeats = sourceBeatAt(playbackEvents, positionBeats);
  const activeEvents = activePlaybackEventsAt(playbackEvents, positionBeats);
  const latestEvent = latestPlaybackEventAt(playbackEvents, positionBeats);
  const displayEvents = activeEvents.length > 0 ? activeEvents : latestEvent ? [latestEvent] : [];
  const velocity =
    displayEvents.length > 0
      ? Math.round(
          (displayEvents.reduce((sum, event) => sum + event.velocity, 0) / displayEvents.length) *
            100,
        )
      : undefined;

  return {
    measure: measureNumberAt(score, sourcePositionBeats),
    dynamic: currentDynamic(score, sourcePositionBeats),
    expression: currentExpression(score, sourcePositionBeats) ?? "-",
    labels: eventLabels(displayEvents),
    tempo: `${Math.round(tempoAtSourceBeat(score, sourcePositionBeats))} BPM`,
    velocity: velocity === undefined ? "-" : `${velocity}%`,
  };
}

function setText(
  ref: RefObject<HTMLSpanElement | null>,
  current: { value: string },
  nextValue: string,
): void {
  if (nextValue === current.value || !ref.current) {
    return;
  }

  current.value = nextValue;
  ref.current.textContent = nextValue;
}

export const PlaybackMetadata = memo(function PlaybackMetadata() {
  const [visible, setVisible] = useState(() => Boolean(usePracticeStore.getState().score));
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const tempoRef = useRef<HTMLSpanElement | null>(null);
  const dynamicRef = useRef<HTMLSpanElement | null>(null);
  const expressionRef = useRef<HTMLSpanElement | null>(null);
  const velocityRef = useRef<HTMLSpanElement | null>(null);
  const labelsRef = useRef<HTMLSpanElement | null>(null);
  const visibleRef = useRef(visible);
  const textRefs = useRef({
    dynamic: { value: "" },
    expression: { value: "" },
    labels: { value: "" },
    measure: { value: "" },
    tempo: { value: "" },
    velocity: { value: "" },
  });

  useEffect(() => {
    const update = (state: PracticeSnapshot) => {
      const metadata = metadataForState(state);
      const nextVisible = Boolean(metadata);
      if (nextVisible !== visibleRef.current) {
        visibleRef.current = nextVisible;
        setVisible(nextVisible);
      }
      if (!metadata) {
        return;
      }

      setText(measureRef, textRefs.current.measure, `M ${metadata.measure}`);
      setText(tempoRef, textRefs.current.tempo, metadata.tempo);
      setText(dynamicRef, textRefs.current.dynamic, `Dyn ${metadata.dynamic}`);
      setText(expressionRef, textRefs.current.expression, `Expr ${metadata.expression}`);
      setText(velocityRef, textRefs.current.velocity, `Vel ${metadata.velocity}`);
      setText(labelsRef, textRefs.current.labels, `Art ${metadata.labels}`);
    };

    update(usePracticeStore.getState());

    return usePracticeStore.subscribe((nextState, previousState) => {
      if (
        nextState.positionBeats !== previousState.positionBeats ||
        nextState.score !== previousState.score ||
        nextState.playbackEvents !== previousState.playbackEvents
      ) {
        update(nextState);
      }
    });
  }, []);

  return (
    <div className="playback-metadata" aria-label="Playback metadata" hidden={!visible}>
      <span ref={measureRef} />
      <span ref={tempoRef} />
      <span ref={dynamicRef} />
      <span ref={expressionRef} />
      <span ref={velocityRef} />
      <span ref={labelsRef} />
    </div>
  );
});
