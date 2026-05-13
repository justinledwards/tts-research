import type { CreateVoiceJobRequest, VoiceJob } from "./types";

// Vite rewrites direct import.meta.env access during dev and build.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? "";

export async function createVoiceJob(request: CreateVoiceJobRequest): Promise<VoiceJob> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceJob>;
}

export async function getVoiceJob(id: string): Promise<VoiceJob> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}`);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceJob>;
}

export function subscribeToVoiceJob(
  id: string,
  onJob: (job: VoiceJob) => void,
  onError: (error: Error) => void,
): () => void {
  const eventSource = new EventSource(`${apiBaseUrl}/api/voice-jobs/${id}/events`);

  eventSource.addEventListener("voice-job", (event) => {
    const message = event as MessageEvent<string>;
    const job = JSON.parse(message.data) as VoiceJob;
    onJob(job);
    if (job.status === "completed" || job.status === "failed") {
      eventSource.close();
    }
  });

  eventSource.addEventListener("voice-job-error", (event) => {
    const message = event as MessageEvent<string>;
    const payload = JSON.parse(message.data) as { error?: string };
    onError(new Error(payload.error ?? "Voice job stream failed"));
  });

  eventSource.addEventListener("error", () => {
    if (eventSource.readyState !== EventSource.CLOSED) {
      onError(new Error("Voice job progress stream disconnected"));
    }
  });

  return () => {
    eventSource.close();
  };
}

export function audioSource(job: VoiceJob): string {
  const version = encodeURIComponent(job.completedAt ?? job.updatedAt);
  const separator = job.audioUrl.includes("?") ? "&" : "?";

  return `${apiBaseUrl}${job.audioUrl}${separator}v=${version}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed with ${String(response.status)}`;
  } catch {
    return `Request failed with ${String(response.status)}`;
  }
}
