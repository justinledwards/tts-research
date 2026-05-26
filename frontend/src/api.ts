import type {
  BookSource,
  BookSourceImportOptions,
  BookCinemaDiagnostics,
  BookScope,
  BookSourceScopeContent,
  AdapterCapability,
  AdapterDiagnostics,
  BundleImportMode,
  CreatePreparedSourceRequest,
  LexiconUpsertRequest,
  CreateVoiceProfileFromCandidateRequest,
  CreateVoiceJobRequest,
  CreateVoiceProfileRequest,
  CreateVoiceProfileSourceRequest,
  FragmentTimingArtifact,
  AlignmentQualityReport,
  HighlightMap,
  MarkdownParseMode,
  MathPreviewResult,
  PlaybackProgress,
  PlaybackProgressUpdate,
  PlaybackSession,
  PreparedSource,
  ProjectSpeechPolicy,
  PronunciationLexicon,
  ProjectBundleImportResult,
  ProjectBundlePreview,
  ProjectBundleSummary,
  ProjectStorageSummary,
  ResearchModuleDiagnostics,
  SpeechPolicyDefinition,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SourceSpeechPolicyUpdateRequest,
  UpsertSpeechPolicyProfileRequest,
  SystemMetrics,
  TokenTimingArtifact,
  TranscriptMetadata,
  TTSEngineDiagnostics,
  Voice,
  VoiceJob,
  VoiceProfileCredentialStatus,
  VoiceProfile,
  VoiceProfileCandidate,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
  VoiceProject,
} from "./types";
import type { ContentIRDocument, ContentIRSchemaVersion, SpeechPlanDocument } from "./content-ir";
import type { HighlightMapV2 } from "./features/readalong";

// Vite rewrites direct import.meta.env access during dev and build.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? "";

function apiEndpoint(path: string, params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `${apiBaseUrl}${path}${suffix}`;
}

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function isApiNotFoundError(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return error.status === 404;
  }
  if (error instanceof Error && "status" in error) {
    return (error as { status?: unknown }).status === 404;
  }
  return error instanceof Error && /\b404\b/.test(error.message);
}

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

export async function getBookCinemaDiagnostics(): Promise<BookCinemaDiagnostics> {
  const response = await fetch(`${apiBaseUrl}/api/book-cinema/diagnostics`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<BookCinemaDiagnostics>;
}

export async function getAdapterCapabilities(): Promise<AdapterCapability[]> {
  const response = await fetch(`${apiBaseUrl}/api/adapters/capabilities`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<AdapterCapability[]>;
}

export async function getAdapterDiagnostics(): Promise<Record<string, AdapterDiagnostics>> {
  const response = await fetch(`${apiBaseUrl}/api/adapters/diagnostics`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<Record<string, AdapterDiagnostics>>;
}

export async function getContentIR(
  id: string,
  schemaVersion?: ContentIRSchemaVersion,
): Promise<ContentIRDocument> {
  const response = await fetch(
    apiEndpoint(`/api/content-ir/${encodeURIComponent(id)}`, { schemaVersion }),
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<ContentIRDocument>;
}

export async function getContentIRSpeechPlan(id: string): Promise<SpeechPlanDocument> {
  const response = await fetch(
    `${apiBaseUrl}/api/content-ir/${encodeURIComponent(id)}/speech-plan`,
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<SpeechPlanDocument>;
}

export async function previewContentIRSpeechPolicy(
  id: string,
  request: {
    profile?: string;
    overrides?: SpeechPolicyOverrides;
    voiceProfileId?: string;
    locale?: string;
    ttsEngine?: string;
  },
  schemaVersion?: ContentIRSchemaVersion,
): Promise<ContentIRDocument> {
  const response = await fetch(
    apiEndpoint(`/api/content-ir/${encodeURIComponent(id)}/speech-policy/preview`, {
      schemaVersion,
    }),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<ContentIRDocument>;
}

export async function listSpeechPolicyProfiles(): Promise<SpeechPolicyProfile[]> {
  const response = await fetch(`${apiBaseUrl}/api/policies/profiles`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<SpeechPolicyProfile[]>;
}

export async function getSpeechPolicyDefinition(): Promise<SpeechPolicyDefinition> {
  const response = await fetch(`${apiBaseUrl}/api/policies/definition`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<SpeechPolicyDefinition>;
}

export async function getProjectSpeechPolicy(projectId: string): Promise<ProjectSpeechPolicy> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/speech-policy`,
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<ProjectSpeechPolicy>;
}

export async function updateProjectSpeechPolicy(
  projectId: string,
  profile: string,
): Promise<ProjectSpeechPolicy> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/speech-policy`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<ProjectSpeechPolicy>;
}

export async function createCustomSpeechPolicyProfile(
  projectId: string,
  request: UpsertSpeechPolicyProfileRequest,
): Promise<ProjectSpeechPolicy> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/speech-policy/profiles`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<ProjectSpeechPolicy>;
}

export async function updateCustomSpeechPolicyProfile(
  projectId: string,
  profileId: string,
  request: UpsertSpeechPolicyProfileRequest,
): Promise<ProjectSpeechPolicy> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/speech-policy/profiles/${encodeURIComponent(profileId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<ProjectSpeechPolicy>;
}

export async function deleteCustomSpeechPolicyProfile(
  projectId: string,
  profileId: string,
): Promise<ProjectSpeechPolicy> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/speech-policy/profiles/${encodeURIComponent(profileId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<ProjectSpeechPolicy>;
}

export async function previewPreparedSourceSpeechPolicy(
  preparedSourceId: string,
  request: {
    profile?: string;
    overrides?: SpeechPolicyOverrides;
    voiceProfileId?: string;
    locale?: string;
    ttsEngine?: string;
  },
): Promise<PreparedSource> {
  const response = await fetch(
    `${apiBaseUrl}/api/source-preps/${encodeURIComponent(preparedSourceId)}/speech-policy/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PreparedSource>;
}

export async function previewBookSourceScopeSpeechPolicy(
  bookSourceId: string,
  request: {
    profile?: string;
    overrides?: SpeechPolicyOverrides;
    scope?: BookScope;
    voiceProfileId?: string;
    locale?: string;
    ttsEngine?: string;
  },
): Promise<BookSourceScopeContent> {
  const response = await fetch(
    `${apiBaseUrl}/api/book-sources/${encodeURIComponent(bookSourceId)}/scope/speech-policy/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<BookSourceScopeContent>;
}

export async function updatePreparedSourceSpeechPolicy(
  preparedSourceId: string,
  request: SourceSpeechPolicyUpdateRequest,
): Promise<PreparedSource> {
  const response = await fetch(
    `${apiBaseUrl}/api/source-preps/${encodeURIComponent(preparedSourceId)}/speech-policy`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PreparedSource>;
}

export async function updateBookSourceSpeechPolicy(
  bookSourceId: string,
  request: SourceSpeechPolicyUpdateRequest,
): Promise<BookSource> {
  const response = await fetch(
    `${apiBaseUrl}/api/book-sources/${encodeURIComponent(bookSourceId)}/speech-policy`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<BookSource>;
}

export async function previewMathSpeech(input: string): Promise<MathPreviewResult> {
  const response = await fetch(`${apiBaseUrl}/api/math/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<MathPreviewResult>;
}

export async function getProjectLexicon(projectId: string): Promise<PronunciationLexicon> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/lexicon`,
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PronunciationLexicon>;
}

export async function upsertProjectLexiconEntry(
  projectId: string,
  request: LexiconUpsertRequest,
): Promise<PronunciationLexicon> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/lexicon`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PronunciationLexicon>;
}

export async function deleteProjectLexiconEntry(
  projectId: string,
  entryId: string,
): Promise<PronunciationLexicon> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/lexicon/entries/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PronunciationLexicon>;
}

export async function importProjectLexicon(
  projectId: string,
  file: File,
): Promise<PronunciationLexicon> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/lexicon/import`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PronunciationLexicon>;
}

export async function getVoiceProfileLexicon(profileId: string): Promise<PronunciationLexicon> {
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profiles/${encodeURIComponent(profileId)}/lexicon`,
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PronunciationLexicon>;
}

export async function upsertVoiceProfileLexiconEntry(
  profileId: string,
  request: LexiconUpsertRequest,
): Promise<PronunciationLexicon> {
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profiles/${encodeURIComponent(profileId)}/lexicon`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PronunciationLexicon>;
}

export async function deleteVoiceProfileLexiconEntry(
  profileId: string,
  entryId: string,
): Promise<PronunciationLexicon> {
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profiles/${encodeURIComponent(profileId)}/lexicon/entries/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PronunciationLexicon>;
}

export async function importVoiceProfileLexicon(
  profileId: string,
  file: File,
): Promise<PronunciationLexicon> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profiles/${encodeURIComponent(profileId)}/lexicon/import`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<PronunciationLexicon>;
}

export async function listProjectBookSources(projectId: string): Promise<BookSource[]> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/book-sources?summary=1`);
  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<BookSource[]>;
}

export async function getBookSourceScope(
  bookSourceId: string,
  scope: BookScope,
): Promise<BookSourceScopeContent> {
  const query = new URLSearchParams();
  query.set("type", scope.type);
  if (scope.chapterIndex !== undefined) {
    query.set("chapterIndex", String(scope.chapterIndex));
  }
  if (scope.pageStart !== undefined) {
    query.set("pageStart", String(scope.pageStart));
  }
  if (scope.pageEnd !== undefined) {
    query.set("pageEnd", String(scope.pageEnd));
  }
  if (scope.label) {
    query.set("label", scope.label);
  }
  const response = await fetch(`${apiBaseUrl}/api/book-sources/${bookSourceId}/scope?${query}`);
  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<BookSourceScopeContent>;
}

export async function createBookSource(
  projectId: string,
  files: File | File[],
  options: BookSourceImportOptions = {},
): Promise<BookSource> {
  const formData = new FormData();
  for (const file of Array.isArray(files) ? files : [files]) {
    formData.append("file", file);
  }
  if (options.importProfile) {
    formData.append("importProfile", options.importProfile);
  }
  if (options.pdfTableMode) {
    formData.append("pdfTableMode", options.pdfTableMode);
  }
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/book-sources`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<BookSource>;
}

export async function createBookSourceFromUrl(
  projectId: string,
  url: string,
  options: BookSourceImportOptions = {},
): Promise<BookSource> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/book-sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, ...options }),
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<BookSource>;
}

export async function listPreparedSources(projectId: string): Promise<PreparedSource[]> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/source-preps`);
  if (!response.ok) {
    throw await apiError(response);
  }
  const sources = (await response.json()) as PreparedSource[];
  return sources.map((source) => normalizePreparedSource(source));
}

export async function createPreparedSource(
  projectId: string,
  request: CreatePreparedSourceRequest | File,
  options: { markdownParseMode?: MarkdownParseMode } = {},
): Promise<PreparedSource> {
  const init: RequestInit = { method: "POST" };
  if (request instanceof File) {
    const formData = new FormData();
    formData.append("file", request);
    if (options.markdownParseMode) {
      formData.append("markdownParseMode", options.markdownParseMode);
    }
    init.body = formData;
  } else {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify({
      ...request,
      markdownParseMode: request.markdownParseMode ?? options.markdownParseMode,
    });
  }
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/source-preps`, init);
  if (!response.ok) {
    throw await apiError(response);
  }
  return normalizePreparedSource((await response.json()) as PreparedSource);
}

export async function createPreparedSourceJob(
  preparedSourceId: string,
  request: CreateVoiceJobRequest,
): Promise<VoiceJob> {
  const response = await fetch(`${apiBaseUrl}/api/source-preps/${preparedSourceId}/voice-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<VoiceJob>;
}

export async function getPreparedSource(id: string): Promise<PreparedSource> {
  const response = await fetch(`${apiBaseUrl}/api/source-preps/${id}`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return normalizePreparedSource((await response.json()) as PreparedSource);
}

export async function refreshPreparedSourceTranscript(id: string): Promise<PreparedSource> {
  const response = await fetch(
    `${apiBaseUrl}/api/source-preps/${encodeURIComponent(id)}/transcript`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return normalizePreparedSource((await response.json()) as PreparedSource);
}

export async function listProjectProgress(projectId: string): Promise<PlaybackProgress[]> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/progress`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<PlaybackProgress[]>;
}

export async function updatePlaybackProgress(
  targetId: string,
  request: PlaybackProgressUpdate,
): Promise<PlaybackProgress> {
  const response = await fetch(`${apiBaseUrl}/api/progress/${encodeURIComponent(targetId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<PlaybackProgress>;
}

export async function startPlaybackSession(
  request: PlaybackProgressUpdate,
): Promise<PlaybackSession> {
  const response = await fetch(`${apiBaseUrl}/api/playback-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<PlaybackSession>;
}

export async function syncPlaybackSession(
  id: string,
  request: PlaybackProgressUpdate,
): Promise<PlaybackSession> {
  const response = await fetch(`${apiBaseUrl}/api/playback-sessions/${id}/sync`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<PlaybackSession>;
}

export async function closePlaybackSession(
  id: string,
  request: PlaybackProgressUpdate,
): Promise<PlaybackSession> {
  const response = await fetch(`${apiBaseUrl}/api/playback-sessions/${id}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<PlaybackSession>;
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

export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    if (response.status === 405) {
      const allowed = response.headers.get("Allow");
      const suffix = allowed ? ` The running backend only allows: ${allowed}.` : "";
      throw new Error(
        `Project deletion is not available from the running backend.${suffix} Restart the backend with mise start -- pnpm start:local so the current API routes are loaded.`,
      );
    }
    throw new Error(await readError(response));
  }
}

export async function listProjectJobs(id: string): Promise<VoiceJob[]> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${id}/jobs`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceJob[]>;
}

export async function getProjectStorageSummary(id: string): Promise<ProjectStorageSummary> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${id}/storage`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<ProjectStorageSummary>;
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

export async function getVoiceJob(
  id: string,
  options?: { includeTiming?: boolean },
): Promise<VoiceJob> {
  const includeTiming = options?.includeTiming ? "?includeTiming=1" : "";
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}${includeTiming}`);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceJob>;
}

export async function getHighlightMap(id: string): Promise<HighlightMap> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}/highlight-map`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<HighlightMap>;
}

export async function getHighlightMapV2(id: string): Promise<HighlightMapV2> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}/highlight-map-v2`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<HighlightMapV2>;
}

export async function getJobSpeechPlan(id: string): Promise<SpeechPlanDocument> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}/speech-plan`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<SpeechPlanDocument>;
}

export async function getFragmentTiming(id: string): Promise<FragmentTimingArtifact> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}/timing/fragments`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<FragmentTimingArtifact>;
}

export async function getTokenTiming(id: string): Promise<TokenTimingArtifact> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}/timing/tokens`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<TokenTimingArtifact>;
}

export async function getAlignmentQuality(id: string): Promise<AlignmentQualityReport> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}/timing/alignment`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<AlignmentQualityReport>;
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

export async function listResearchModules(): Promise<ResearchModuleDiagnostics[]> {
  const response = await fetch(`${apiBaseUrl}/api/research-modules`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<ResearchModuleDiagnostics[]>;
}

export async function getVoiceProfileCredentials(): Promise<VoiceProfileCredentialStatus> {
  const response = await fetch(`${apiBaseUrl}/api/voice-profile-credentials`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfileCredentialStatus>;
}

export async function saveHuggingFaceToken(token: string): Promise<VoiceProfileCredentialStatus> {
  const response = await fetch(`${apiBaseUrl}/api/voice-profile-credentials/hugging-face-token`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfileCredentialStatus>;
}

export async function clearHuggingFaceToken(): Promise<VoiceProfileCredentialStatus> {
  const response = await fetch(`${apiBaseUrl}/api/voice-profile-credentials/hugging-face-token`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfileCredentialStatus>;
}

export async function cloneResearchModule(id: string): Promise<ResearchModuleDiagnostics> {
  const response = await fetch(
    `${apiBaseUrl}/api/research-modules/${encodeURIComponent(id)}/clone`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<ResearchModuleDiagnostics>;
}

export async function listVoices(): Promise<Voice[]> {
  const response = await fetch(`${apiBaseUrl}/api/voices`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<Voice[]>;
}

export async function createCloneVoice(name: string, file: File): Promise<Voice> {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("file", file);

  const response = await fetch(`${apiBaseUrl}/api/voices`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<Voice>;
}

export function voiceReferenceAudioUrl(id: string): string {
  return `${apiBaseUrl}/api/voices/${encodeURIComponent(id)}/reference-audio`;
}

export async function createVoiceProfile(
  request: CreateVoiceProfileRequest,
): Promise<VoiceProfile> {
  const formData = new FormData();
  formData.append("name", request.name);
  formData.append("language", request.language);
  formData.append("file", request.file);
  if (request.targets && request.targets.length > 0) {
    formData.append("targets", JSON.stringify(request.targets));
  }
  if (typeof request.autoValidate === "boolean") {
    formData.append("autoValidate", String(request.autoValidate));
  }

  const response = await fetch(`${apiBaseUrl}/api/voice-profiles`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfile>;
}

export async function buildVoiceProfileArtifact(
  profileId: string,
  moduleId: string,
  timeoutSeconds?: number,
): Promise<VoiceProfile> {
  const body = typeof timeoutSeconds === "number" ? JSON.stringify({ timeoutSeconds }) : undefined;

  const response = await fetch(
    `${apiBaseUrl}/api/voice-profiles/${encodeURIComponent(profileId)}/artifacts/${encodeURIComponent(moduleId)}`,
    {
      method: "POST",
      ...(body
        ? {
            headers: {
              "Content-Type": "application/json",
            },
            body,
          }
        : {}),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfile>;
}

export async function queueVoiceProfileTarget(
  profileId: string,
  targetId: string,
  autoValidate = true,
): Promise<VoiceProfile> {
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profiles/${encodeURIComponent(profileId)}/targets/${encodeURIComponent(targetId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ autoValidate }),
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceProfile>;
}

export async function cancelVoiceProfileTarget(
  profileId: string,
  targetId: string,
): Promise<VoiceProfile> {
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profiles/${encodeURIComponent(profileId)}/targets/${encodeURIComponent(targetId)}/cancel`,
    {
      method: "POST",
    },
  );

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

export async function cancelVoiceProfileSource(id: string): Promise<VoiceProfileSource> {
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profile-sources/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
    },
  );

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

export async function refreshVoiceProfileSourceTranscript(id: string): Promise<VoiceProfileSource> {
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profile-sources/${encodeURIComponent(id)}/transcript`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return normalizeVoiceProfileSource((await response.json()) as VoiceProfileSource);
}

export async function refreshVoiceProfileCandidateTranscript(
  sourceId: string,
  candidateId: string,
): Promise<VoiceProfileCandidate> {
  const response = await fetch(
    `${apiBaseUrl}/api/voice-profile-sources/${encodeURIComponent(sourceId)}/candidates/${encodeURIComponent(candidateId)}/transcript`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return normalizeVoiceProfileCandidate((await response.json()) as VoiceProfileCandidate);
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
  const normalized = normalizeTranscriptFields(source);

  return {
    ...normalized,
    candidates: Array.isArray(nullableSource.candidates)
      ? nullableSource.candidates.map((candidate) => normalizeVoiceProfileCandidate(candidate))
      : [],
    stages: Array.isArray(nullableSource.stages) ? nullableSource.stages : [],
  };
}

export function normalizePreparedSource(source: PreparedSource): PreparedSource {
  return normalizeTranscriptFields(source);
}

export function normalizeVoiceProfileCandidate(
  candidate: VoiceProfileCandidate,
): VoiceProfileCandidate {
  return normalizeTranscriptFields(candidate);
}

interface TranscriptCapable {
  transcriptMetadata?: TranscriptMetadata | null;
  transcript?: string;
  transcriptGeneratedAt?: string;
  transcriptModel?: string;
  transcriptError?: string;
  transcriptConfidence?: number;
}

function normalizeTranscriptFields<T extends TranscriptCapable>(item: T): T {
  const metadata = item.transcriptMetadata ?? undefined;
  const transcript = item.transcript ?? metadata?.text;
  const transcriptGeneratedAt = item.transcriptGeneratedAt ?? metadata?.generatedAt;
  const transcriptModel = item.transcriptModel ?? metadata?.model ?? metadata?.provider;
  const transcriptError = item.transcriptError ?? metadata?.error;
  const transcriptConfidence = item.transcriptConfidence ?? metadata?.confidence;
  const transcriptMetadata =
    metadata ??
    (transcript || transcriptGeneratedAt || transcriptModel || transcriptError
      ? {
          text: transcript,
          generatedAt: transcriptGeneratedAt,
          model: transcriptModel,
          confidence: transcriptConfidence,
          error: transcriptError,
        }
      : undefined);
  return {
    ...item,
    ...(transcriptMetadata ? { transcriptMetadata } : {}),
    ...(transcript ? { transcript } : {}),
    ...(transcriptGeneratedAt ? { transcriptGeneratedAt } : {}),
    ...(transcriptModel ? { transcriptModel } : {}),
    ...(transcriptError ? { transcriptError } : {}),
    ...(typeof transcriptConfidence === "number" ? { transcriptConfidence } : {}),
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

export function backendAssetUrl(path: string): string {
  if (!path) {
    return "";
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed with ${String(response.status)}`;
  } catch {
    return `Request failed with ${String(response.status)}`;
  }
}

async function apiError(response: Response): Promise<ApiRequestError> {
  return new ApiRequestError(response.status, await readError(response));
}
