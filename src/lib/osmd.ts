export function preloadOsmd(): void {
  void import("opensheetmusicdisplay");
}

export async function loadOsmd() {
  return import("opensheetmusicdisplay");
}
