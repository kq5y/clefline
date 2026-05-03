import { memo, useMemo } from "react";
import { initialTempo } from "../store/practiceStore";
import type { DirectionEvent, PlaybackEvent, ScoreModel } from "../lib/musicxml";

type PlaybackMetadataProps = {
  score?: ScoreModel;
  playbackEvents: PlaybackEvent[];
  positionBeats: number;
};

const DYNAMIC_LABELS = new Set(["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"]);
const ARTICULATION_LABELS: Record<string, string> = {
  accent: "Accent",
  arpeggiate: "Arp.",
  grace: "Grace",
  staccatissimo: "Stacc.",
  staccato: "Stacc.",
  "strong-accent": "Marc.",
  tenuto: "Tenuto",
};

function directionText(direction: DirectionEvent | undefined): string | undefined {
  const value = direction?.text ?? direction?.value;

  return value === undefined ? undefined : String(value);
}

function currentDynamic(score: ScoreModel, positionBeats: number): string {
  const direction = score.directions.findLast(
    (item) => item.kind === "dynamic" && item.beat <= positionBeats,
  );
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
  const wedge = score.directions.findLast(
    (item) => item.kind === "wedge" && item.beat <= positionBeats,
  );
  const text = directionText(wedge)?.toLowerCase();
  if (!text || text === "stop") {
    return undefined;
  }

  return text.includes("diminuendo") ? "Dim." : text.includes("crescendo") ? "Cresc." : text;
}

function activeEvents(playbackEvents: PlaybackEvent[], positionBeats: number): PlaybackEvent[] {
  const active: PlaybackEvent[] = [];
  for (const event of playbackEvents) {
    if (event.absoluteBeat > positionBeats) {
      break;
    }
    if (event.absoluteBeat + Math.max(event.durationBeats, 0.1) <= positionBeats) {
      continue;
    }
    active.push(event);
  }

  return active;
}

export const PlaybackMetadata = memo(function PlaybackMetadata({
  score,
  playbackEvents,
  positionBeats,
}: PlaybackMetadataProps) {
  const meta = useMemo(() => {
    if (!score) {
      return undefined;
    }

    const events = activeEvents(playbackEvents, positionBeats);
    const labels = Array.from(
      new Set(
        events.flatMap((event) => event.notationLabels).map((label) => ARTICULATION_LABELS[label]),
      ),
    ).filter(Boolean);
    const velocity =
      events.length > 0
        ? Math.round((events.reduce((sum, event) => sum + event.velocity, 0) / events.length) * 100)
        : undefined;
    const measure = score.measures.findLast((item) => item.startBeat <= positionBeats);

    return {
      measure: measure?.number ?? "1",
      dynamic: currentDynamic(score, positionBeats),
      expression: currentExpression(score, positionBeats),
      labels,
      tempo: Math.round(initialTempo(score)),
      velocity,
    };
  }, [playbackEvents, positionBeats, score]);

  if (!meta) {
    return null;
  }

  return (
    <div className="playback-metadata" aria-label="Playback metadata">
      <span>M {meta.measure}</span>
      <span>{meta.tempo} BPM</span>
      <span>Dyn {meta.dynamic}</span>
      {meta.expression ? <span>{meta.expression}</span> : null}
      {meta.velocity ? <span>Vel {meta.velocity}%</span> : null}
      {meta.labels.slice(0, 3).map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
});
