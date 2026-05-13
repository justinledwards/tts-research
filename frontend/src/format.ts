export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "0.0s";
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}
