const MUSIC_SYMBOLS: Record<string, string> = {
  coda: "Coda",
  segno: "Segno",
};

function musicSymbol(name: string): string {
  return MUSIC_SYMBOLS[name.trim().toLowerCase()] ?? name;
}

export function sanitizeScoreDisplayXml(xml: string): string {
  return xml
    .replace(/&lt;sym&gt;\s*(coda|segno)\s*&lt;\/?sym&gt;/gi, (_, name: string) =>
      musicSymbol(name),
    )
    .replace(/<sym>\s*(coda|segno)\s*<\/?sym>/gi, (_, name: string) => musicSymbol(name))
    .replace(/<coda\b[^>]*\/>/gi, "<words>Coda</words>")
    .replace(/<segno\b[^>]*\/>/gi, "<words>Segno</words>");
}
