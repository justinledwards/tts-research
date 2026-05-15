import type {
  BookSource,
  BundleImportMode,
  CreateVoiceProfileFromCandidateRequest,
  CreateVoiceJobRequest,
  CreateVoiceProfileRequest,
  CreateVoiceProfileSourceRequest,
  ProjectBundleImportResult,
  ProjectBundlePreview,
  ProjectBundleSummary,
  SystemMetrics,
  TTSEngineDiagnostics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
  VoiceProject,
} from "./types";

// Vite rewrites direct import.meta.env access during dev and build.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? "";

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

export async function listProjectBookSources(projectId: string): Promise<BookSource[]> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/book-sources`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<BookSource[]>;
}

export async function createBookSource(projectId: string, file: File): Promise<BookSource> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/book-sources`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<BookSource>;
}

export async function createBookNarrationJob(
  bookSourceId: string,
  request: CreateVoiceJobRequest,
): Promise<VoiceJob> {
  const response = await fetch(`${apiBaseUrl}/api/book-sources/${bookSourceId}/voice-jobs`, {
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

export async function listProjects(): Promise<VoiceProject[]> {
  const response = await fetch(`${apiBaseUrl}/api/projects`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProject[]>;
}

export async function createProject(name: string): Promise<VoiceProject> {
  const response = await fetch(`${apiBaseUrl}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProject>;
}

export async function renameProject(id: string, name: string): Promise<VoiceProject> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProject>;
}

export async function listProjectJobs(id: string): Promise<VoiceJob[]> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${id}/jobs`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceJob[]>;
}

export async function getProjectBundleSummary(id: string): Promise<ProjectBundleSummary> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${id}/bundle/summary`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<ProjectBundleSummary>;
}

export function projectBundleDownloadUrl(id: string): string {
  return `${apiBaseUrl}/api/projects/${id}/bundle`;
}

export async function previewProjectBundle(file: File): Promise<ProjectBundlePreview> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${apiBaseUrl}/api/project-bundles/preview`, {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as ProjectBundlePreview | { error?: string };
  if (!response.ok) {
    if ("valid" in payload) {
      return payload;
    }
    throw new Error(payload.error ?? `Request failed with ${String(response.status)}`);
  }
  return payload as ProjectBundlePreview;
}

export async function importProjectBundle(
  file: File,
  mode: BundleImportMode,
  projectId?: string,
): Promise<ProjectBundleImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", mode);
  if (projectId) {
    formData.append("projectId", projectId);
  }
  const response = await fetch(`${apiBaseUrl}/api/project-bundles/import`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<ProjectBundleImportResult>;
}

export async function getVoiceJob(id: string): Promise<VoiceJob> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}`);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceJob>;
}

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  const response = await fetch(`${apiBaseUrl}/api/voice-profiles`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfile[]>;
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const response = await fetch(`${apiBaseUrl}/api/system-metrics`);
  if (!response.ok) {
    throw new Error(`${String(response.status)} ${await readError(response)}`);
  }

  return response.json() as Promise<SystemMetrics>;
}

export async function listTTSEngines(): Promise<TTSEngineDiagnostics[]> {
  const response = await fetch(`${apiBaseUrl}/api/tts-engines`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<TTSEngineDiagnostics[]>;
}

export async function createVoiceProfile(
  request: CreateVoiceProfileRequest,
): Promise<VoiceProfile> {
  const formData = new FormData();
  formData.append("name", request.name);
  formData.append("language", request.language);
  formData.append("file", request.file);

  const response = await fetch(`${apiBaseUrl}/api/voice-profiles`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfile>;
}

export async function createVoiceProfileSource(
  request: CreateVoiceProfileSourceRequest,
): Promise<VoiceProfileSource> {
  const formData = new FormData();
  formData.append("file", request.file);

  const response = await fetch(`${apiBaseUrl}/api/voice-profile-sources`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return normalizeVoiceProfileSource((await response.json()) as VoiceProfileSource);
}

export async function getVoiceProfileSource(id: string): Promise<VoiceProfileSource> {
  const response = await fetch(`${apiBaseUrl}/api/voice-profile-sources/${id}`);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return normalizeVoiceProfileSource((await response.json()) as VoiceProfileSource);
}

export async function getVoiceProfileSourceDiagnostics(): Promise<VoiceProfileSourceDiagnostics> {
  const response = await fetch(`${apiBaseUrl}/api/voice-profile-sources/diagnostics`);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfileSourceDiagnostics>;
}

export function normalizeVoiceProfileSource(source: VoiceProfileSource): VoiceProfileSource {
  const nullableSource = source as VoiceProfileSource & {
    candidates?: VoiceProfileSource["candidates"] | null;
    stages?: VoiceProfileSource["stages"] | null;
  };

  return {
    ...source,
    candidates: Array.isArray(nullableSource.candidates) ? nullableSource.candidates : [],
    stages: Array.isArray(nullableSource.stages) ? nullableSource.stages : [],
  };
}

export async function createVoiceProfileFromCandidate(
  sourceId: string,
  candidateId: string,
  request: CreateVoiceProfileFromCandidateRequest,
): Promise<VoiceProfile> {
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profile-sources/${sourceId}/candidates/${candidateId}/profiles`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfile>;
}

export function voiceProfileCandidatePreviewSource(
  sourceId: string,
  candidateId: string,
  kind: "clean" | "raw" = "clean",
): string {
  return `${apiBaseUrl}/api/voice-profile-sources/${sourceId}/candidates/${candidateId}/preview.wav?kind=${kind}`;
}

export async function deleteVoiceProfile(id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/voice-profiles/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export async function cancelVoiceJob(id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}/cancel`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
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
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
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

export function audioSource(job: VoiceJob, options?: { partial: boolean }): string {
  const usePartial = options?.partial ?? false;
  const useStreamingPartial =
    usePartial && job.status !== "completed" && Boolean(job.audioPartialUrl);
  const baseUrl = useStreamingPartial ? job.audioPartialUrl : job.audioUrl;
  if (!baseUrl) {
    return "";
  }

  if (!useStreamingPartial) {
    return `${apiBaseUrl}${baseUrl}`;
  }

  return `${apiBaseUrl}${baseUrl}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed with ${String(response.status)}`;
  } catch {
    return `Request failed with ${String(response.status)}`;
  }
}
