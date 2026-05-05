let osmdPromise: Promise<typeof import("opensheetmusicdisplay")> | undefined;

export function preloadOsmd(): void {
  if (!osmdPromise) {
    osmdPromise = import("opensheetmusicdisplay");
  }
}

export async function loadOsmd() {
  if (!osmdPromise) {
    osmdPromise = import("opensheetmusicdisplay");
  }
  return osmdPromise;
}
