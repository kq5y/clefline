import type { OpenSheetMusicDisplay as OSMDInstance } from "opensheetmusicdisplay";

type AsyncOSMD = OSMDInstance & {
  renderAsync?: (onProgress?: (phase: string, current: number, total: number) => void) => Promise<void>;
};

export async function loadAndRenderOsmdAsync(
  osmd: OSMDInstance,
  xml: string,
  onProgress?: (message: string, percent: number) => void,
): Promise<void> {
  onProgress?.("Loading MusicXML...", 5);
  await osmd.load(xml);

  onProgress?.("Calculating layout...", 10);

  const asyncOsmd = osmd as AsyncOSMD;
  if (typeof asyncOsmd.renderAsync === "function") {
    await asyncOsmd.renderAsync((phase, current, total) => {
      const percent = Math.round((current / total) * 100);
      onProgress?.(phase, percent);
    });
  } else {
    osmd.render();
  }

  onProgress?.("Complete", 100);
}
