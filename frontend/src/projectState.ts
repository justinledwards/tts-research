import type { BookScope, ReadingPosition } from "./types";

export const ACTIVE_PROJECT_ID_STORAGE_KEY = "tts-active-project-id";
export const LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY = "tts-source-text";
export const LEGACY_JOB_ID_STORAGE_KEY = "tts-active-job-id";

export interface ProjectWorkspaceState {
  text: string;
  jobId: string | null;
  bookSourceId: string | null;
  bookScope: BookScope | null;
  readingPosition: ReadingPosition | null;
  updatedAt: string;
}

const PROJECT_WORKSPACE_STATE_PREFIX = "tts-project-state:";

export function projectWorkspaceStateKey(projectId: string): string {
  return `${PROJECT_WORKSPACE_STATE_PREFIX}${cleanProjectId(projectId)}`;
}

export function blankProjectWorkspaceState(): ProjectWorkspaceState {
  return {
    text: "",
    jobId: null,
    bookSourceId: null,
    bookScope: null,
    readingPosition: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function loadProjectWorkspaceState(projectId: string): ProjectWorkspaceState {
  const stored = localStorage.getItem(projectWorkspaceStateKey(projectId));
  if (!stored) {
    return blankProjectWorkspaceState();
  }

  try {
    return normalizeProjectWorkspaceState(JSON.parse(stored) as unknown);
  } catch {
    return blankProjectWorkspaceState();
  }
}

export function saveProjectWorkspaceState(
  projectId: string,
  state: Pick<ProjectWorkspaceState, "text"> &
    Partial<
      Pick<ProjectWorkspaceState, "jobId" | "bookSourceId" | "bookScope" | "readingPosition">
    >,
): void {
  localStorage.setItem(
    projectWorkspaceStateKey(projectId),
    JSON.stringify(
      normalizeProjectWorkspaceState({
        ...state,
        updatedAt: new Date().toISOString(),
      }),
    ),
  );
}

export function clearProjectWorkspaceState(projectId: string): void {
  localStorage.removeItem(projectWorkspaceStateKey(projectId));
}

export function migrateLegacyWorkspaceState(projectId: string): void {
  const key = projectWorkspaceStateKey(projectId);
  if (localStorage.getItem(key)) {
    clearLegacyWorkspaceState();
    return;
  }

  const legacyText = localStorage.getItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY);
  const legacyJobId = localStorage.getItem(LEGACY_JOB_ID_STORAGE_KEY);
  if (!legacyText && !legacyJobId) {
    return;
  }

  saveProjectWorkspaceState(projectId, {
    text: legacyText ?? "",
    jobId: legacyJobId && legacyJobId.trim().length > 0 ? legacyJobId : null,
  });
  clearLegacyWorkspaceState();
}

export function clearLegacyWorkspaceState(): void {
  localStorage.removeItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY);
  localStorage.removeItem(LEGACY_JOB_ID_STORAGE_KEY);
}

function normalizeProjectWorkspaceState(value: unknown): ProjectWorkspaceState {
  if (!value || typeof value !== "object") {
    return blankProjectWorkspaceState();
  }

  const candidate = value as Partial<ProjectWorkspaceState>;
  return {
    text: typeof candidate.text === "string" ? candidate.text : "",
    jobId:
      typeof candidate.jobId === "string" && candidate.jobId.trim().length > 0
        ? candidate.jobId
        : null,
    bookSourceId:
      typeof candidate.bookSourceId === "string" && candidate.bookSourceId.trim().length > 0
        ? candidate.bookSourceId
        : null,
    bookScope: normalizeBookScope(candidate.bookScope),
    readingPosition: normalizeReadingPosition(candidate.readingPosition),
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt.trim().length > 0
        ? candidate.updatedAt
        : new Date(0).toISOString(),
  };
}

function normalizeReadingPosition(value: unknown): ReadingPosition | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ReadingPosition>;
  return {
    activeWordIndex:
      typeof candidate.activeWordIndex === "number" && Number.isFinite(candidate.activeWordIndex)
        ? candidate.activeWordIndex
        : undefined,
    bookSourceId:
      typeof candidate.bookSourceId === "string" && candidate.bookSourceId.trim().length > 0
        ? candidate.bookSourceId
        : undefined,
    locator: candidate.locator,
    nodeId:
      typeof candidate.nodeId === "string" && candidate.nodeId.trim().length > 0
        ? candidate.nodeId
        : undefined,
    scopeKey:
      typeof candidate.scopeKey === "string" && candidate.scopeKey.trim().length > 0
        ? candidate.scopeKey
        : undefined,
    textQuote:
      typeof candidate.textQuote === "string" && candidate.textQuote.trim().length > 0
        ? candidate.textQuote
        : undefined,
  };
}

function normalizeBookScope(value: unknown): BookScope | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<BookScope>;
  if (candidate.type !== "book" && candidate.type !== "chapter" && candidate.type !== "pages") {
    return null;
  }
  return {
    type: candidate.type,
    chapterIndex:
      typeof candidate.chapterIndex === "number" && Number.isFinite(candidate.chapterIndex)
        ? candidate.chapterIndex
        : undefined,
    pageStart:
      typeof candidate.pageStart === "number" && Number.isFinite(candidate.pageStart)
        ? candidate.pageStart
        : undefined,
    pageEnd:
      typeof candidate.pageEnd === "number" && Number.isFinite(candidate.pageEnd)
        ? candidate.pageEnd
        : undefined,
    label: typeof candidate.label === "string" ? candidate.label : undefined,
  };
}

function cleanProjectId(projectId: string): string {
  const clean = projectId.trim();
  return clean.length > 0 ? clean : "default";
}
