import JSZip from "jszip";

export type LoadedMusicXml = {
  xml: string;
  sourceName: string;
};

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

async function loadCompressedMusicXml(file: File): Promise<LoadedMusicXml> {
  const zip = await JSZip.loadAsync(file);
  const container = zip.file("META-INF/container.xml");
  let rootPath: string | undefined;

  if (container) {
    const containerXml = await container.async("text");
    const document = parseXml(containerXml);
    rootPath =
      document.querySelector("rootfile[full-path]")?.getAttribute("full-path") ?? undefined;
  }

  rootPath ??= Object.keys(zip.files).find(
    (path) => path.toLowerCase().endsWith(".xml") && !path.startsWith("META-INF/"),
  );

  if (!rootPath) {
    throw new Error("Compressed MusicXML does not contain a score XML file.");
  }

  const xmlFile = zip.file(rootPath);
  if (!xmlFile) {
    throw new Error(`Compressed MusicXML references missing file: ${rootPath}`);
  }

  return {
    xml: await xmlFile.async("text"),
    sourceName: file.name,
  };
}

export async function readMusicXmlFile(file: File): Promise<LoadedMusicXml> {
  if (file.name.toLowerCase().endsWith(".mxl")) {
    return loadCompressedMusicXml(file);
  }

  return {
    xml: await file.text(),
    sourceName: file.name,
  };
}

async function loadCompressedMusicXmlFromBuffer(
  buffer: ArrayBuffer,
  sourceName: string,
): Promise<LoadedMusicXml> {
  const zip = await JSZip.loadAsync(buffer);
  const container = zip.file("META-INF/container.xml");
  let rootPath: string | undefined;

  if (container) {
    const containerXml = await container.async("text");
    const document = parseXml(containerXml);
    rootPath =
      document.querySelector("rootfile[full-path]")?.getAttribute("full-path") ?? undefined;
  }

  rootPath ??= Object.keys(zip.files).find(
    (path) => path.toLowerCase().endsWith(".xml") && !path.startsWith("META-INF/"),
  );

  if (!rootPath) {
    throw new Error("Compressed MusicXML does not contain a score XML file.");
  }

  const xmlFile = zip.file(rootPath);
  if (!xmlFile) {
    throw new Error(`Compressed MusicXML references missing file: ${rootPath}`);
  }

  return {
    xml: await xmlFile.async("text"),
    sourceName,
  };
}

export async function fetchMusicXml(url: string): Promise<LoadedMusicXml> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch MusicXML: ${response.status}`);
  }

  const sourceName = url.split("/").pop() || url;

  if (sourceName.toLowerCase().endsWith(".mxl")) {
    const buffer = await response.arrayBuffer();
    return loadCompressedMusicXmlFromBuffer(buffer, sourceName);
  }

  return {
    xml: await response.text(),
    sourceName,
  };
}
