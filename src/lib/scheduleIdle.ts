export function scheduleIdle(callback: () => void): () => void {
  if (window.requestIdleCallback && window.cancelIdleCallback) {
    const id = window.requestIdleCallback(callback, { timeout: 1_200 });

    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(callback, 300);

  return () => window.clearTimeout(id);
}
