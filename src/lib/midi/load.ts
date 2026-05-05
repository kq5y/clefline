export type LoadedMidi = {
  arrayBuffer: ArrayBuffer;
  sourceName: string;
};

export async function readMidiFile(file: File): Promise<LoadedMidi> {
  const arrayBuffer = await file.arrayBuffer();
  return {
    arrayBuffer,
    sourceName: file.name,
  };
}

export async function fetchMidi(url: string): Promise<LoadedMidi> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch MIDI: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const sourceName = url.split("/").pop() || "midi";
  return {
    arrayBuffer,
    sourceName,
  };
}
