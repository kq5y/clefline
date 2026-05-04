import { FileMusic, Upload } from "lucide-react";
import { memo, type ChangeEvent } from "react";
import { usePracticeStore } from "../store/practiceStore";

export const WelcomeScreen = memo(function WelcomeScreen() {
  const loadFile = usePracticeStore((state) => state.loadFile);
  const loadSample = usePracticeStore((state) => state.loadSample);
  const isLoading = usePracticeStore((state) => state.isLoading);

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
        <h2>Clefline</h2>
        <p className="welcome-description">Load a MusicXML file to start practicing</p>
        <div className="welcome-actions">
          <button
            type="button"
            className="welcome-button"
            onClick={() => void loadSample()}
            disabled={isLoading}
          >
            <FileMusic size={20} />
            <span>Try Sample</span>
          </button>
          <label className="welcome-button primary">
            <Upload size={20} />
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
