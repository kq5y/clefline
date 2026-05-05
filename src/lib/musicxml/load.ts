import JSZip from "jszip";

export type LoadedMusicXml = {
  xml: string;
  sourceName: string;
};

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

async function extractXmlFromZip(zip: JSZip): Promise<string> {
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

  return xmlFile.async("text");
}

export async function readMusicXmlFile(file: File): Promise<LoadedMusicXml> {
  if (file.name.toLowerCase().endsWith(".mxl")) {
    const zip = await JSZip.loadAsync(file);
    return { xml: await extractXmlFromZip(zip), sourceName: file.name };
  }

  return { xml: await file.text(), sourceName: file.name };
}

export async function fetchMusicXml(url: string): Promise<LoadedMusicXml> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch MusicXML: ${response.status}`);
  }

  const sourceName = url.split("/").pop() || url;

  if (sourceName.toLowerCase().endsWith(".mxl")) {
    const buffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    return { xml: await extractXmlFromZip(zip), sourceName };
  }

  return { xml: await response.text(), sourceName };
}
