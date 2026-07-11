import type {
  LocatorEnvelope,
  ReadalongManifest,
  ReadingUnitManifest,
  SourceEnvelope,
  SourceRevision,
} from "@tts-research/schema";
import {
  normalizePreparedSource,
  normalizeVoiceProfileCandidate,
  normalizeVoiceProfileSource,
} from "./apiNormalizationHelpers";
import type { ContentIRDocument, ContentIRSchemaVersion, SpeechPlanDocument } from "./content-ir";
import type { HighlightMapV2 } from "./features/readalong";
import type {
  AdapterCapability,
  AdapterDiagnostics,
  AlignmentQualityReport,
  BookCinemaDiagnostics,
  BookScope,
  BookSource,
  BookSourceImportOptions,
  BookSourceScopeContent,
  BundleImportMode,
  CreatePreparedSourceRequest,
  CreateTemporarySourceRequest,
  CreateVoiceJobRequest,
  CreateVoiceProfileFromCandidateRequest,
  CreateVoiceProfileRequest,
  CreateVoiceProfileSourceRequest,
  FragmentTimingArtifact,
  HighlightMap,
  LexiconUpsertRequest,
  MarkdownParseMode,
  MathPreviewResult,
  PlaybackProgress,
  PlaybackProgressUpdate,
  PlaybackSession,
  PreparedSource,
  ProjectBundleImportResult,
  ProjectBundlePreview,
  ProjectBundleSummary,
  ProjectSpeechPolicy,
  ProjectStorageSummary,
  PronunciationLexicon,
  RenameAssetRequest,
  ResearchModuleDiagnostics,
  SourceReadinessConfirmationRequest,
  SourceSpeechPolicyUpdateRequest,
  SpeechPolicyDefinition,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SystemMetrics,
  TemporarySourceCleanupRequest,
  TemporarySourceCleanupResult,
  TemporarySourceEnvelope,
  TemporarySourcePromotionRequest,
  TemporarySourceSession,
  TemporaryStorageUsageSummary,
  TokenTimingArtifact,
  TTSEngineDiagnostics,
  UpsertSpeechPolicyProfileRequest,
  Voice,
  VoiceJob,
  VoiceProfile,
  VoiceProfileCandidate,
  VoiceProfileCredentialStatus,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
  VoiceProject,
} from "./types";

export {
  normalizePreparedSource,
  normalizeVoiceProfileCandidate,
  normalizeVoiceProfileSource,
} from "./apiNormalizationHelpers";

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
  readonly code?: string;
  readonly temporarySource?: boolean;

  constructor(
    status: number,
    message: string,
    options: { code?: string; temporarySource?: boolean } = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = options.code;
    this.temporarySource = options.temporarySource;
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

export type ReaderWorkspaceSyncFidelity =
  | "exact_word"
  | "phrase"
  | "block"
  | "audio_only"
  | "source_only"
  | "none";

export interface ReaderWorkspaceSnapshot {
  readonly schemaVersion: "reader_workspace_snapshot.v1";
  readonly projectId: string;
  readonly projectRevision: number;
  readonly readMode: "paused" | "readable";
  readonly sourceId: string;
  readonly sourceRevisionId: string;
  readonly sourceContentHash: string;
  readonly runId: string | null;
  readonly runCompatibilityKey: string | null;
  readonly mediaManifestVersion: number | null;
  readonly timingRevision: number | null;
  readonly syncFidelity: ReaderWorkspaceSyncFidelity | null;
  readonly readerLocator: LocatorEnvelope | null;
  readonly playbackCursorMs: number | null;
  readonly playbackRate: number | null;
  readonly followPreference: boolean | null;
  readonly updatedAt: string;
}

export interface ReaderWorkspaceVersionedSnapshot {
  readonly snapshot: ReaderWorkspaceSnapshot;
  readonly etag: string;
}

export class ReaderWorkspacePreconditionError extends ApiRequestError {
  readonly current: ReaderWorkspaceSnapshot;
  readonly etag: string;

  constructor(message: string, current: ReaderWorkspaceSnapshot, etag: string) {
    super(412, message);
    this.name = "ReaderWorkspacePreconditionError";
    this.current = current;
    this.etag = etag;
  }
}

export async function getReaderWorkspace(
  projectId: string,
): Promise<ReaderWorkspaceVersionedSnapshot> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/reader-workspace`,
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return {
    snapshot: (await response.json()) as ReaderWorkspaceSnapshot,
    etag: requiredReaderWorkspaceETag(response),
  };
}

export async function putReaderWorkspace(
  projectId: string,
  snapshot: ReaderWorkspaceSnapshot,
  etag: string,
): Promise<ReaderWorkspaceVersionedSnapshot> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/reader-workspace`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": etag },
      body: JSON.stringify(snapshot),
    },
  );
  if (response.status === 412) {
    const payload = (await response.json()) as {
      current: ReaderWorkspaceSnapshot;
      error?: string;
      retryToken?: string;
    };
    throw new ReaderWorkspacePreconditionError(
      payload.error ?? "Reader workspace changed on the server",
      payload.current,
      requiredReaderWorkspaceETag(response, payload.retryToken),
    );
  }
  if (!response.ok) {
    throw await apiError(response);
  }
  return {
    snapshot: (await response.json()) as ReaderWorkspaceSnapshot,
    etag: requiredReaderWorkspaceETag(response),
  };
}

function requiredReaderWorkspaceETag(response: Response, fallback?: string): string {
  const etag = response.headers.get("ETag")?.trim() ?? fallback?.trim();
  if (!etag) {
    throw new ApiRequestError(response.status, "Reader workspace response is missing ETag");
  }
  return etag;
}

export type SourceManifestEventType =
  | "source_revision_created"
  | "extraction_revision_updated"
  | "reading_unit_manifest_written"
  | "readalong_manifest_written"
  | "audio_artifact_updated"
  | "progress_updated"
  | "repair_overlay_created"
  | "promotion_crosswalk_created"
  | "artifact_interrupted_retriable";

export interface SourceManifestEventSubject {
  readonly sourceRevisionId?: string;
  readonly extractionRevisionId?: string;
  readonly readingUnitManifestId?: string;
  readonly readalongManifestId?: string;
  readonly audioArtifactId?: string;
  readonly progressId?: string;
  readonly repairOverlayId?: string;
  readonly promotionCrosswalkId?: string;
  readonly state?: string;
}

export interface SourceManifestEvent {
  readonly schemaVersion: string;
  readonly eventId: string;
  readonly sourceId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly eventType: SourceManifestEventType;
  readonly snapshotAvailable: boolean;
  readonly cursor?: string;
  readonly subject: SourceManifestEventSubject;
  readonly snapshotManifestId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface SourceManifestEventReplay {
  readonly sourceId: string;
  readonly afterSequence: number;
  readonly events: SourceManifestEvent[];
  readonly gap: boolean;
  readonly snapshotRequired: boolean;
  readonly latestSequence: number;
  readonly nextCursor?: string;
}

export interface SourceManifestSnapshotFallback {
  readonly sourceId: string;
  readonly sourceRevisionId?: string;
  readonly cursor?: string;
  readonly latestSequence: number;
  readonly sourceEnvelope?: SourceEnvelope;
  readonly sourceRevision?: SourceRevision;
  readonly currentReadingUnitManifest?: ReadingUnitManifest;
  readonly currentReadalongManifest?: ReadalongManifest;
}

export interface SourceManifestReplayRequest {
  readonly sourceId: string;
  readonly afterSequence?: number;
  readonly limit?: number;
}

export interface SourceManifestSnapshotRequest {
  readonly sourceId: string;
  readonly sourceRevisionId?: string;
}

export interface SourceManifestStreamRequest extends SourceManifestReplayRequest {
  readonly once?: boolean;
}

export interface SourceManifestStreamHandlers {
  readonly onEvent: (event: SourceManifestEvent) => void;
  readonly onGap: (replay: SourceManifestEventReplay) => void;
  readonly onError: (error: Error) => void;
}

export interface SourceManifestEventSourceLike {
  readonly readyState?: number;
  addEventListener(type: string, listener: (event: Event | MessageEvent<string>) => void): void;
  close(): void;
}

export interface SourceManifestSubscribeOptions {
  readonly eventSourceFactory?: (url: string) => SourceManifestEventSourceLike;
}

export async function replaySourceManifestEvents(
  request: SourceManifestReplayRequest,
): Promise<SourceManifestEventReplay> {
  const response = await fetch(sourceManifestEventsUrl("/api/source-manifest/events", request));
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<SourceManifestEventReplay>;
}

export async function getSourceManifestSnapshot(
  request: SourceManifestSnapshotRequest,
): Promise<SourceManifestSnapshotFallback> {
  const response = await fetch(
    apiEndpoint("/api/source-manifest/snapshot", {
      sourceId: request.sourceId,
      sourceRevisionId: request.sourceRevisionId,
    }),
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<SourceManifestSnapshotFallback>;
}

export function sourceManifestEventsStreamUrl(request: SourceManifestStreamRequest): string {
  return sourceManifestEventsUrl("/api/source-manifest/events/stream", request);
}

function defaultSourceManifestEventSourceFactory(url: string): SourceManifestEventSourceLike {
  if (typeof EventSource === "undefined") {
    throw new TypeError("EventSource is not available in this environment");
  }
  return new EventSource(url);
}

function noopSourceManifestDispose(): void {
  return;
}

export function subscribeToSourceManifestEvents(
  request: SourceManifestStreamRequest,
  handlers: SourceManifestStreamHandlers,
  options: SourceManifestSubscribeOptions = {},
): () => void {
  const factory = options.eventSourceFactory ?? defaultSourceManifestEventSourceFactory;

  let eventSource: SourceManifestEventSourceLike;
  try {
    eventSource = factory(sourceManifestEventsStreamUrl(request));
  } catch (error) {
    handlers.onError(error instanceof Error ? error : new Error(String(error)));
    return noopSourceManifestDispose;
  }

  let closed = false;
  eventSource.addEventListener("source-manifest-event", (event) => {
    parseSourceManifestSsePayload(
      event,
      (payload) => {
        handlers.onEvent(payload as SourceManifestEvent);
      },
      handlers.onError,
    );
  });
  eventSource.addEventListener("source-manifest-gap", (event) => {
    parseSourceManifestSsePayload(
      event,
      (payload) => {
        handlers.onGap(payload as SourceManifestEventReplay);
      },
      handlers.onError,
    );
  });
  eventSource.addEventListener("error", () => {
    if (!closed) {
      handlers.onError(new Error("Source manifest event stream disconnected"));
    }
  });

  return () => {
    closed = true;
    eventSource.close();
  };
}

function sourceManifestEventsUrl(
  path: string,
  request: SourceManifestReplayRequest | SourceManifestStreamRequest,
): string {
  return apiEndpoint(path, {
    sourceId: request.sourceId,
    afterSequence:
      typeof request.afterSequence === "number" ? String(request.afterSequence) : undefined,
    limit: typeof request.limit === "number" ? String(request.limit) : undefined,
    once: "once" in request && typeof request.once === "boolean" ? String(request.once) : undefined,
  });
}

function parseSourceManifestSsePayload(
  event: Event | MessageEvent<string>,
  onPayload: (payload: unknown) => void,
  onError: (error: Error) => void,
): void {
  const data = "data" in event && typeof event.data === "string" ? event.data : "";
  try {
    onPayload(JSON.parse(data));
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
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

export async function retryVoiceJob(id: string): Promise<VoiceJob> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}/retry`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<VoiceJob>;
}

export async function deleteVoiceJob(id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/voice-jobs/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export interface VoicePreviewAudio {
  readonly audio: Blob;
  readonly contentType: string;
  readonly durationMs: number | null;
  readonly provider: string;
  readonly voice: string;
}

export async function createVoicePreview(
  request: CreateVoiceJobRequest,
): Promise<VoicePreviewAudio> {
  const response = await fetch(`${apiBaseUrl}/api/voice-previews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  const contentType = response.headers.get("Content-Type") ?? "audio/wav";
  return {
    audio: await response.blob(),
    contentType,
    durationMs: parseOptionalNumber(response.headers.get("X-Voice-Preview-Duration-Ms")),
    provider: response.headers.get("X-Voice-Preview-Provider") ?? "",
    voice: response.headers.get("X-Voice-Preview-Voice") ?? "",
  };
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

export async function renameBookSource(
  bookSourceId: string,
  request: RenameAssetRequest,
): Promise<BookSource> {
  const response = await fetch(`${apiBaseUrl}/api/book-sources/${bookSourceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<BookSource>;
}

export async function deleteBookSource(bookSourceId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/book-sources/${bookSourceId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await apiError(response);
  }
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

export async function confirmBookSourceReadiness(
  bookSourceId: string,
  request: SourceReadinessConfirmationRequest,
): Promise<BookSource> {
  const response = await fetch(`${apiBaseUrl}/api/book-sources/${bookSourceId}/readiness/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<BookSource>;
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

export async function createTemporarySource(
  request: CreateTemporarySourceRequest | File,
  options: { markdownParseMode?: MarkdownParseMode } = {},
): Promise<TemporarySourceSession> {
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
  const response = await fetch(`${apiBaseUrl}/api/temporary-sources`, init);
  if (!response.ok) {
    throw await apiError(response);
  }
  const payload = (await response.json()) as TemporarySourceEnvelope | TemporarySourceSession;
  return temporarySourceFromPayload(payload);
}

export async function getTemporarySource(id: string): Promise<TemporarySourceSession> {
  const response = await fetch(`${apiBaseUrl}/api/temporary-sources/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return temporarySourceFromPayload(
    (await response.json()) as TemporarySourceEnvelope | TemporarySourceSession,
  );
}

export async function reopenTemporarySource(id: string): Promise<TemporarySourceSession> {
  const response = await fetch(
    `${apiBaseUrl}/api/temporary-sources/${encodeURIComponent(id)}/reopen`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return temporarySourceFromPayload(
    (await response.json()) as TemporarySourceEnvelope | TemporarySourceSession,
  );
}

export async function listTemporarySources(): Promise<TemporarySourceSession[]> {
  const response = await fetch(`${apiBaseUrl}/api/temporary-sources`);
  if (!response.ok) {
    throw await apiError(response);
  }
  const payload = (await response.json()) as (TemporarySourceEnvelope | TemporarySourceSession)[];
  return payload.map((source) => temporarySourceFromPayload(source));
}

export async function listTemporarySourceJobs(): Promise<VoiceJob[]> {
  const response = await fetch(`${apiBaseUrl}/api/temporary-sources/jobs`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<VoiceJob[]>;
}

export async function getTemporaryStorageUsageSummary(): Promise<TemporaryStorageUsageSummary> {
  const response = await fetch(`${apiBaseUrl}/api/temporary-sources/storage/summary`);
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<TemporaryStorageUsageSummary>;
}

export async function cleanupTemporarySource(
  id: string,
  request: TemporarySourceCleanupRequest,
): Promise<TemporarySourceCleanupResult> {
  const response = await fetch(
    `${apiBaseUrl}/api/temporary-sources/${encodeURIComponent(id)}/cleanup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<TemporarySourceCleanupResult>;
}

export async function clearExpiredTemporarySources(): Promise<TemporarySourceCleanupResult> {
  const response = await fetch(`${apiBaseUrl}/api/temporary-sources/cleanup-expired`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<TemporarySourceCleanupResult>;
}

export async function clearTemporarySources(): Promise<TemporarySourceCleanupResult> {
  const response = await fetch(`${apiBaseUrl}/api/temporary-sources/clear`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json() as Promise<TemporarySourceCleanupResult>;
}

export async function deleteTemporarySource(id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/temporary-sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await apiError(response);
  }
}

export async function confirmTemporarySourceReadiness(
  id: string,
  request: SourceReadinessConfirmationRequest,
): Promise<TemporarySourceSession> {
  const response = await fetch(
    `${apiBaseUrl}/api/temporary-sources/${encodeURIComponent(id)}/readiness/confirm`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return temporarySourceFromPayload(
    (await response.json()) as TemporarySourceEnvelope | TemporarySourceSession,
  );
}

function temporarySourceFromPayload(
  payload: TemporarySourceEnvelope | TemporarySourceSession,
): TemporarySourceSession {
  const source = "source" in payload ? payload.source : payload;
  return { ...source, scope: "temporary", sourceOwner: "temporary" };
}

export async function promoteTemporarySource(
  id: string,
  request: TemporarySourcePromotionRequest,
): Promise<PreparedSource> {
  const response = await fetch(
    `${apiBaseUrl}/api/temporary-sources/${encodeURIComponent(id)}/promote`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw await apiError(response);
  }
  return normalizePreparedSource((await response.json()) as PreparedSource);
}

export async function createTemporarySourceJob(
  temporarySourceId: string,
  request: CreateVoiceJobRequest,
): Promise<VoiceJob> {
  const response = await fetch(
    `${apiBaseUrl}/api/temporary-sources/${encodeURIComponent(temporarySourceId)}/voice-jobs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<VoiceJob>;
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

export async function renamePreparedSource(
  preparedSourceId: string,
  request: RenameAssetRequest,
): Promise<PreparedSource> {
  const response = await fetch(`${apiBaseUrl}/api/source-preps/${preparedSourceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return normalizePreparedSource((await response.json()) as PreparedSource);
}

export async function deletePreparedSource(preparedSourceId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/source-preps/${preparedSourceId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await apiError(response);
  }
}

export async function confirmPreparedSourceReadiness(
  preparedSourceId: string,
  request: SourceReadinessConfirmationRequest,
): Promise<PreparedSource> {
  const response = await fetch(
    `${apiBaseUrl}/api/source-preps/${preparedSourceId}/readiness/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
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

export async function getProjectBundleSummary(
  id: string,
  options: { includeGeneratedAudio?: boolean } = {},
): Promise<ProjectBundleSummary> {
  const response = await fetch(
    `${apiBaseUrl}/api/projects/${id}/bundle/summary${bundleAudioQuery(options.includeGeneratedAudio)}`,
  );
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<ProjectBundleSummary>;
}

export function projectBundleDownloadUrl(
  id: string,
  options: { includeGeneratedAudio?: boolean } = {},
): string {
  return `${apiBaseUrl}/api/projects/${id}/bundle${bundleAudioQuery(options.includeGeneratedAudio)}`;
}

function bundleAudioQuery(includeGeneratedAudio: boolean | undefined): string {
  return typeof includeGeneratedAudio === "boolean"
    ? `?includeGeneratedAudio=${String(includeGeneratedAudio)}`
    : "";
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
  if (request.provenance) {
    formData.append("provenance", JSON.stringify(request.provenance));
  }

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

export async function renameVoiceProfile(
  profileId: string,
  request: RenameAssetRequest,
): Promise<VoiceProfile> {
  const response = await fetch(`${apiBaseUrl}/api/voice-profiles/${profileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<VoiceProfile>;
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
  let closed = false;
  let pollingTimer: ReturnType<typeof globalThis.setInterval> | null = null;

  const stopPolling = () => {
    if (pollingTimer) {
      globalThis.clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };
  const emitJob = (job: VoiceJob) => {
    onJob(job);
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      eventSource.close();
      stopPolling();
    }
  };
  const pollJob = () => {
    void getVoiceJob(id)
      .then(emitJob)
      .catch((error: unknown) => {
        onError(error instanceof Error ? error : new Error(String(error)));
      });
  };
  const startPolling = () => {
    if (pollingTimer || closed) {
      return;
    }
    pollJob();
    pollingTimer = globalThis.setInterval(pollJob, 2000);
  };

  eventSource.addEventListener("voice-job", (event) => {
    const message = event as MessageEvent<string>;
    const job = JSON.parse(message.data) as VoiceJob;
    emitJob(job);
  });

  eventSource.addEventListener("voice-job-error", (event) => {
    const message = event as MessageEvent<string>;
    const payload = JSON.parse(message.data) as { error?: string };
    onError(new Error(payload.error ?? "Voice job stream failed"));
  });

  eventSource.addEventListener("error", () => {
    if (eventSource.readyState !== EventSource.CLOSED) {
      onError(new Error("Voice job progress stream disconnected"));
      eventSource.close();
      startPolling();
    }
  });

  return () => {
    closed = true;
    stopPolling();
    eventSource.close();
  };
}

export function audioSource(job: VoiceJob, options?: { partial: boolean }): string {
  const usePartial = options?.partial ?? false;
  const useStreamingPartial =
    usePartial && job.status !== "completed" && Boolean(job.audioPartialUrl);
  const baseUrl = useStreamingPartial ? job.audioPartialUrl : job.audioUrl || job.audioPartialUrl;
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

interface ErrorPayload {
  code?: string;
  message: string;
  temporarySource?: boolean;
}

async function readErrorPayload(response: Response): Promise<ErrorPayload> {
  const fallback = `Request failed with ${String(response.status)}`;
  let rawBody = "";
  try {
    rawBody = await response.text();
  } catch {
    return { message: fallback };
  }
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return { message: fallback };
  }
  try {
    const payload = JSON.parse(trimmed) as {
      code?: unknown;
      error?: unknown;
      message?: unknown;
      temporarySource?: unknown;
    };
    const error = typeof payload.error === "string" ? payload.error.trim() : "";
    if (error) {
      return {
        code: typeof payload.code === "string" ? payload.code : undefined,
        message: error,
        temporarySource: payload.temporarySource === true,
      };
    }
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    if (message) {
      return {
        code: typeof payload.code === "string" ? payload.code : undefined,
        message,
        temporarySource: payload.temporarySource === true,
      };
    }
  } catch {
    return { message: trimmed };
  }
  return { message: trimmed };
}

async function readError(response: Response): Promise<string> {
  const payload = await readErrorPayload(response);
  return payload.message;
}

async function apiError(response: Response): Promise<ApiRequestError> {
  const payload = await readErrorPayload(response);
  return new ApiRequestError(response.status, payload.message, {
    code: payload.code,
    temporarySource: payload.temporarySource,
  });
}

function parseOptionalNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
