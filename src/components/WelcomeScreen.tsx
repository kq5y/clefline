import { FileMusic, Upload } from "lucide-react";
import { memo, useState, type ChangeEvent } from "react";
import { usePracticeStore } from "../store/practiceStore";

type Sample = {
  id: string;
  file: string;
  title: string;
};

const SAMPLES: Sample[] = [
  { id: "bach-minuet", file: "bach-minuet.mxl", title: "Minuet in G - J.S. Bach" },
  { id: "fur-elise", file: "fur-elise-easy.mxl", title: "Für Elise (Easy) - Beethoven" },
  { id: "flight", file: "flight-of-the-bumblebee.mxl", title: "Flight of the Bumblebee - Rimsky-Korsakov" },
  { id: "la-campanella", file: "la-campanella.mxl", title: "La Campanella - Franz Liszt" },
  { id: "moonlight-3rd", file: "moonlight-sonata-3rd.mxl", title: "Moonlight Sonata 3rd Mvt - Beethoven" },
];

export const WelcomeScreen = memo(function WelcomeScreen() {
  const loadFile = usePracticeStore((state) => state.loadFile);
  const loadSample = usePracticeStore((state) => state.loadSample);
  const isLoading = usePracticeStore((state) => state.isLoading);
  const [selectedSample, setSelectedSample] = useState(SAMPLES[0].file);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void loadFile(file);
    }
    event.target.value = "";
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <h2>Get Started</h2>
        <p className="welcome-description">Load a MusicXML file to start practicing</p>
        <div className="welcome-actions">
          <div className="sample-select-group">
            <select
              className="sample-select"
              value={selectedSample}
              onChange={(e) => setSelectedSample(e.target.value)}
              disabled={isLoading}
            >
              {SAMPLES.map((sample) => (
                <option key={sample.id} value={sample.file}>
                  {sample.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="welcome-button"
              onClick={() => void loadSample(selectedSample)}
              disabled={isLoading}
            >
              <FileMusic size={18} />
              <span>Load</span>
            </button>
          </div>
          <label className="welcome-button primary">
            <Upload size={18} />
            <span>Open File</span>
            <input
              accept=".musicxml,.xml,.mxl"
              type="file"
              onChange={onFileChange}
              disabled={isLoading}
            />
          </label>
        </div>
        <p className="welcome-hint">or drag & drop a file anywhere</p>
      </div>
    </div>
  );
});
