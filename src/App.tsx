import "./App.css";

function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MusicXML piano practice</p>
          <h1>Piano River</h1>
        </div>
        <button type="button" className="ghost-button">
          Load MusicXML
        </button>
      </header>
      <section className="viewer-panel" aria-label="Music viewer">
        <div className="viewer-placeholder">
          <span>River view</span>
        </div>
      </section>
      <section className="transport" aria-label="Practice controls">
        <button type="button">Play</button>
        <button type="button">Score</button>
        <button type="button">Both hands</button>
      </section>
      <section className="keyboard-shell" aria-label="Piano keyboard" />
    </main>
  );
}

export default App;
