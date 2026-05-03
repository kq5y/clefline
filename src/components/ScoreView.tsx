import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef, useState } from "react";
import type { ScoreModel } from "../lib/musicxml";

type ScoreViewProps = {
  score?: ScoreModel;
  positionBeats: number;
};

function currentMeasure(score: ScoreModel, positionBeats: number): string {
  const measure = score.measures.findLast((item) => item.startBeat <= positionBeats);

  return measure?.number ?? score.measures[0]?.number ?? "1";
}

export function ScoreView({ score, positionBeats }: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !score) {
      return undefined;
    }

    let cancelled = false;
    container.innerHTML = "";
    setError(undefined);

    const osmd = new OpenSheetMusicDisplay(container, {
      backend: "svg",
      autoResize: true,
      drawTitle: true,
      drawingParameters: "compacttight",
    });

    void osmd
      .load(score.rawXml)
      .then(() => {
        if (!cancelled) {
          osmd.render();
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to render score.");
      });

    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [score]);

  if (!score) {
    return (
      <div className="empty-state">
        <p>Load MusicXML to view notation.</p>
      </div>
    );
  }

  return (
    <div className="score-view">
      <div className="score-current-measure">Measure {currentMeasure(score, positionBeats)}</div>
      {error ? <div className="score-error">{error}</div> : null}
      <div className="score-canvas" ref={containerRef} />
    </div>
  );
}
