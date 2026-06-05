const readAlongAudioElements = new Map<string, HTMLAudioElement>();

export function registerReadAlongAudioElement(
  jobId: string | null | undefined,
  audio: HTMLAudioElement | null | undefined,
): () => void {
  if (!jobId || !audio) {
    return noop;
  }
  readAlongAudioElements.set(jobId, audio);
  return () => {
    const current = readAlongAudioElements.get(jobId);
    if (current === audio) {
      readAlongAudioElements.delete(jobId);
    }
  };
}

export function readAlongAudioElementForJob(
  jobId: string | null | undefined,
): HTMLAudioElement | null {
  return jobId ? (readAlongAudioElements.get(jobId) ?? null) : null;
}

function noop(): void {
  // Registry cleanup is optional when no audio element was registered.
}
