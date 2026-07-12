import type { WorkspaceSourceType, WorkspaceStage } from "./features/workspace/model";
import type { BookScope, ReadingPosition } from "./types";

export const ACTIVE_PROJECT_ID_STORAGE_KEY = "tts-active-project-id";
export const LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY = "tts-source-text";
export const LEGACY_JOB_ID_STORAGE_KEY = "tts-active-job-id";

export interface ProjectWorkspaceState {
  activeBlockId: string | null;
  bookSourceId: string | null;
  bookScope: BookScope | null;
  jobId: string | null;
  preparedSourceId: string | null;
  readingPosition: ReadingPosition | null;
  sourceMode: "book" | "fileUrl" | "text";
  sourceType: WorkspaceSourceType;
  speechPolicyProfile: string | null;
  stage: WorkspaceStage;
  text: string;
  updatedAt: string;
  voiceProfileId: string | null;
}

const PROJECT_WORKSPACE_STATE_PREFIX = "tts-project-state:";

export function projectWorkspaceStateKey(projectId: string): string {
  return `${PROJECT_WORKSPACE_STATE_PREFIX}${cleanProjectId(projectId)}`;
}

export function blankProjectWorkspaceState(): ProjectWorkspaceState {
  return {
    activeBlockId: null,
    bookSourceId: null,
    bookScope: null,
    jobId: null,
    preparedSourceId: null,
    readingPosition: null,
    sourceMode: "text",
    sourceType: "draft",
    speechPolicyProfile: null,
    stage: "intake",
    text: "",
    updatedAt: new Date(0).toISOString(),
    voiceProfileId: null,
  };
}

export function loadProjectWorkspaceState(projectId: string): ProjectWorkspaceState {
  // Durable reader identity and position are server-authored. Old browser snapshots are
  // cleanup-only and must never participate in restore.
  clearProjectWorkspaceState(projectId);
  return blankProjectWorkspaceState();
}

export function saveProjectWorkspaceState(
  projectId: string,
  state: Pick<ProjectWorkspaceState, "text"> & Partial<ProjectWorkspaceState>,
): void;
export function saveProjectWorkspaceState(projectId: string): void {
  clearProjectWorkspaceState(projectId);
}

export function clearProjectWorkspaceState(projectId: string): void {
  localStorage.removeItem(projectWorkspaceStateKey(projectId));
}

export function migrateLegacyWorkspaceState(projectId: string): void {
  clearProjectWorkspaceState(projectId);
  clearLegacyWorkspaceState();
}

export function clearLegacyWorkspaceState(): void {
  localStorage.removeItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY);
  localStorage.removeItem(LEGACY_JOB_ID_STORAGE_KEY);
}

function cleanProjectId(projectId: string): string {
  const clean = projectId.trim();
  return clean.length > 0 ? clean : "default";
}
