import type {
  BookSource,
  BookSourceScopeContent,
  BookScope,
  CreateVoiceJobRequest,
  PreparedSource,
  SpeechPolicyOverrides,
  VoiceJob,
} from "../../types";
import { compactSpeechPolicyOverrides, hasSpeechPolicyOverrides } from "../../speechPolicy";
import { bookScopeKey } from "../book-cinema/model";
import { progressTargetIdForBookScope } from "../../appHelpers";
import { shouldUseCanonicalPreviewPlanForBookNarration } from "./bookNarration";
import {
  shouldUseCanonicalPreviewPlanForPreparedSourceNarration,
  resolvePreparedSourceNarrationSelectedBlockIds,
  resolvePreparedSourceNarrationText,
} from "./preparedSourceNarration";
import {
  canonicalPreviewSpeechPlanHasBlocks,
  type CanonicalPreviewSpeechPlan,
} from "./revisionSpeechPlan";
import type { RevisionBlock } from "./revisionFilters";

export interface AssetNarrationGenerationOptions {
  useCurrentReviewSession?: boolean;
}

type RequestState = "idle" | "running" | "complete" | "cancelled" | "error";

type StateValue<T> = T | ((current: T) => T);

export interface SubmissionStateSetters {
  setRequestState: (state: RequestState) => void;
  setError: (error: string | null) => void;
  setBookSourceError: (error: string | null) => void;
  setSourcePrepError: (error: string | null) => void;
  setPlaybackCursorSec: (cursorSec: number) => void;
  setIsPlaybackActive: (active: boolean) => void;
  setActiveDemoProjectId: (projectId: string | null) => void;
  setJob: (job: VoiceJob) => void;
  setContentMode: (mode: string) => void;
  setSelectedBookSourceId: (bookSourceId: string | null) => void;
  setSelectedBookScope: (scope: BookScope | null) => void;
  setSourceMode: (mode: "text" | "book" | "fileUrl") => void;
  setText: (value: string) => void;
  setSelectedPreparedSourceId: (preparedSourceId: string | null) => void;
  setBookScopeContent: (content: StateValue<BookSourceScopeContent | null>) => void;
  setPreparedSources: (updater: (sources: PreparedSource[]) => PreparedSource[]) => void;
  clearMissingBookSource: (bookId: string | null) => void;
}

interface SubmissionRuntime {
  activeProjectId: string;
  hasRevisionSessionChanges: boolean;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
  reviewedNarrationSpeechText: string;
  canonicalPreviewSpeechPlan: CanonicalPreviewSpeechPlan;
  text: string;
  narrationPreviewBlocks: RevisionBlock[];
  bookScopeContent: BookSourceScopeContent | null;
  buildVoiceJobRequest: (
    sourceText: string,
    preparedSource?: PreparedSource | null,
  ) => CreateVoiceJobRequest;
  applySpeechPolicyToCreateVoiceJobRequest: (
    request: CreateVoiceJobRequest,
    overrides: { speechPolicyOverrides: SpeechPolicyOverrides; speechPolicyProfile: string },
  ) => CreateVoiceJobRequest;
}

export interface SubmissionDependencies extends SubmissionRuntime, SubmissionStateSetters {
  createVoiceJob: (request: CreateVoiceJobRequest) => Promise<VoiceJob>;
  createBookNarrationJob: (bookId: string, request: CreateVoiceJobRequest) => Promise<VoiceJob>;
  createPreparedSourceJob: (sourceId: string, request: CreateVoiceJobRequest) => Promise<VoiceJob>;
  getBookSourceScope: (bookId: string, scope: BookScope) => Promise<BookSourceScopeContent>;
  getPreparedSource: (sourceId: string) => Promise<PreparedSource>;
  isApiNotFoundError: (error: unknown) => boolean;
  announcePolite: () => void;
  announceAssertive: () => void;
  announceVoiceJobTerminalStatus: (job: VoiceJob) => void;
  refreshProjectJobs: (projectId: string) => Promise<void> | void;
}

function formatErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function bookScopeContentMatches(
  content: BookSourceScopeContent | null,
  bookId: string,
  scope: BookScope,
): boolean {
  return content?.bookSourceId === bookId && bookScopeKey(content.scope) === bookScopeKey(scope);
}

export function generationTextForPreviewSpeechPlan(
  plan: CanonicalPreviewSpeechPlan,
  fallbackText: string,
): string {
  return canonicalPreviewSpeechPlanHasBlocks(plan) ? plan.text : fallbackText;
}

function isPreparedSourceDisplayIncomplete(source: PreparedSource | null): boolean {
  if (!source) {
    return false;
  }
  if (source.renderMode === "markdown") {
    return !source.text;
  }
  return !source.text || !source.speechText;
}

function upsertPreparedSource(
  currentSources: PreparedSource[],
  source: PreparedSource,
): PreparedSource[] {
  return [source, ...currentSources.filter((item) => item.id !== source.id)];
}

async function loadBookNarrationText(
  deps: SubmissionDependencies,
  book: BookSource,
  scope: BookScope,
): Promise<BookSourceScopeContent | null> {
  const existingContent = bookScopeContentMatches(deps.bookScopeContent, book.id, scope)
    ? deps.bookScopeContent
    : null;
  if (existingContent?.text.trim()) {
    return existingContent;
  }

  try {
    const content = await deps.getBookSourceScope(book.id, scope);
    deps.setBookScopeContent(content);
    return content;
  } catch (caughtError) {
    if (deps.isApiNotFoundError(caughtError)) {
      deps.clearMissingBookSource(book.id);
    } else {
      deps.setBookSourceError(
        formatErrorMessage(caughtError, "Unable to load book narration text"),
      );
    }
    return null;
  }
}

async function loadPreparedSourceForNarration(
  deps: SubmissionDependencies,
  source: PreparedSource,
  applyReviewSession: boolean,
): Promise<PreparedSource | null> {
  if (applyReviewSession || !isPreparedSourceDisplayIncomplete(source)) {
    return source;
  }

  try {
    const hydratedSource = await deps.getPreparedSource(source.id);
    deps.setPreparedSources((currentSources) =>
      upsertPreparedSource(currentSources, hydratedSource),
    );
    return hydratedSource;
  } catch (caughtError) {
    deps.setSourcePrepError(formatErrorMessage(caughtError, "Unable to load prepared source"));
    return null;
  }
}

export async function submitVoiceJob(deps: SubmissionDependencies): Promise<void> {
  const sourceText = generationTextForPreviewSpeechPlan(deps.canonicalPreviewSpeechPlan, deps.text);
  if (canonicalPreviewSpeechPlanHasBlocks(deps.canonicalPreviewSpeechPlan) && !sourceText.trim()) {
    deps.setError("Current preview has no speakable blocks.");
    return;
  }

  let request = deps.applySpeechPolicyToCreateVoiceJobRequest(
    deps.buildVoiceJobRequest(sourceText),
    {
      speechPolicyOverrides: deps.speechPolicyOverrides,
      speechPolicyProfile: deps.speechPolicyProfile,
    },
  );

  if (deps.hasRevisionSessionChanges) {
    request = { ...request, speechRenderApplied: true };
  }

  deps.setRequestState("running");
  deps.setError(null);
  deps.setPlaybackCursorSec(0);
  deps.setIsPlaybackActive(false);
  deps.announcePolite();

  try {
    const nextJob = await deps.createVoiceJob(request);
    deps.setActiveDemoProjectId(null);
    deps.setJob(nextJob);
    deps.setContentMode("preview");
    void deps.refreshProjectJobs(nextJob.projectId || deps.activeProjectId);
    deps.setRequestState(nextJob.status === "completed" ? "complete" : "running");
    deps.announceVoiceJobTerminalStatus(nextJob);
  } catch (caughtError) {
    deps.setRequestState("error");
    deps.setError(formatErrorMessage(caughtError, "Unable to create voice job"));
    deps.announceAssertive();
  }
}

export async function submitBookNarrationJob(
  deps: SubmissionDependencies,
  book: BookSource,
  scope: BookScope,
  options: AssetNarrationGenerationOptions = {},
): Promise<void> {
  if (book.status !== "ready") {
    deps.setBookSourceError(book.error ?? "Book source is not ready for narration.");
    return;
  }

  const scopeContent = await loadBookNarrationText(deps, book, scope);
  if (!scopeContent) {
    return;
  }

  const useCurrentReviewSession = options.useCurrentReviewSession ?? true;
  const applyReviewSession = useCurrentReviewSession && deps.hasRevisionSessionChanges;

  const matchingScopeContent = bookScopeContentMatches(deps.bookScopeContent, book.id, scope)
    ? deps.bookScopeContent
    : null;

  const useCanonicalPreviewPlan = shouldUseCanonicalPreviewPlanForBookNarration({
    applyReviewSession,
    canonicalPreviewSpeechPlan: deps.canonicalPreviewSpeechPlan,
    bookScopeContent: matchingScopeContent,
    isMatchingScopeContent: Boolean(matchingScopeContent),
  });

  const narrationText = useCanonicalPreviewPlan
    ? deps.canonicalPreviewSpeechPlan.text
    : scopeContent.text;

  if (useCanonicalPreviewPlan && !narrationText.trim()) {
    deps.setBookSourceError("Current preview has no speakable blocks.");
    return;
  }

  const sessionOverrides = compactSpeechPolicyOverrides(deps.speechPolicyOverrides);
  const request: CreateVoiceJobRequest = {
    ...deps.buildVoiceJobRequest(narrationText),
    bookSourceId: book.id,
    bookScope: scope,
    progressTargetId: progressTargetIdForBookScope(book.id, scope),
    sourceKind: "book",
    ...(applyReviewSession || (useCanonicalPreviewPlan && (scopeContent.blocks?.length ?? 0) > 0)
      ? { speechRenderApplied: true }
      : {}),
    ...(hasSpeechPolicyOverrides(sessionOverrides)
      ? { speechPolicyOverrides: sessionOverrides }
      : {}),
    ...(useCanonicalPreviewPlan ? { speechText: narrationText } : {}),
  };

  deps.setRequestState("running");
  deps.setError(null);
  deps.setBookSourceError(null);
  deps.setPlaybackCursorSec(0);
  deps.setIsPlaybackActive(false);
  deps.setSelectedBookSourceId(book.id);
  deps.setSelectedBookScope(scope);
  deps.setSourceMode("book");
  deps.setText(narrationText);
  deps.announcePolite();

  try {
    const nextJob = await deps.createBookNarrationJob(book.id, request);
    deps.setActiveDemoProjectId(null);
    deps.setJob(nextJob);
    deps.setSelectedBookSourceId(nextJob.bookSourceId ?? book.id);
    deps.setSelectedBookScope(nextJob.bookScope ?? scope);
    deps.setContentMode("preview");
    void deps.refreshProjectJobs(nextJob.projectId || deps.activeProjectId);
    deps.setRequestState(nextJob.status === "completed" ? "complete" : "running");
    deps.announceVoiceJobTerminalStatus(nextJob);
  } catch (caughtError) {
    deps.setRequestState("error");
    deps.setBookSourceError(formatErrorMessage(caughtError, "Unable to create book narration"));
    deps.announceAssertive();
  }
}

export async function submitPreparedSourceJob(
  deps: SubmissionDependencies,
  source: PreparedSource,
  options: AssetNarrationGenerationOptions = {},
): Promise<void> {
  if (source.status !== "ready") {
    deps.setSourcePrepError(source.error ?? "Prepared source is not ready for narration.");
    return;
  }

  const useCurrentReviewSession = options.useCurrentReviewSession ?? true;
  const applyReviewSession = useCurrentReviewSession && deps.hasRevisionSessionChanges;

  const useCanonicalPreviewPlan = shouldUseCanonicalPreviewPlanForPreparedSourceNarration(
    applyReviewSession,
    deps.canonicalPreviewSpeechPlan,
  );

  const jobSource = await loadPreparedSourceForNarration(deps, source, applyReviewSession);
  if (!jobSource) {
    return;
  }

  const speechText = resolvePreparedSourceNarrationText(jobSource, {
    applyReviewSession,
    reviewedNarrationSpeechText: deps.reviewedNarrationSpeechText,
    useCanonicalPreviewPlan,
    canonicalPreviewSpeechPlan: deps.canonicalPreviewSpeechPlan,
  });

  if ((applyReviewSession || useCanonicalPreviewPlan) && !speechText.trim()) {
    deps.setSourcePrepError("Prepared source has no speakable blocks.");
    return;
  }

  const sessionOverrides = compactSpeechPolicyOverrides(deps.speechPolicyOverrides);
  const request: CreateVoiceJobRequest = {
    ...deps.buildVoiceJobRequest(speechText, jobSource),
    preparedSourceId: jobSource.id,
    selectedBlockIds: resolvePreparedSourceNarrationSelectedBlockIds(jobSource, {
      applyReviewSession,
      useCanonicalPreviewPlan,
      canonicalPreviewSpeechPlan: deps.canonicalPreviewSpeechPlan,
      narrationPreviewBlocks: deps.narrationPreviewBlocks,
    }),
    sourceKind: jobSource.kind,
    progressTargetId: `prepared:${jobSource.id}`,
    ...(applyReviewSession ? { speechRenderApplied: true } : {}),
    ...(hasSpeechPolicyOverrides(sessionOverrides)
      ? { speechPolicyOverrides: sessionOverrides }
      : {}),
  };

  deps.setRequestState("running");
  deps.setError(null);
  deps.setSourcePrepError(null);
  deps.setPlaybackCursorSec(0);
  deps.setIsPlaybackActive(false);
  deps.setSelectedPreparedSourceId(jobSource.id);
  deps.setSourceMode("fileUrl");
  if (speechText.trim()) {
    deps.setText(speechText);
  }
  deps.announcePolite();

  try {
    const nextJob = applyReviewSession
      ? await deps.createVoiceJob(request)
      : await deps.createPreparedSourceJob(jobSource.id, request);
    deps.setActiveDemoProjectId(null);
    deps.setJob(nextJob);
    deps.setContentMode("preview");
    void deps.refreshProjectJobs(nextJob.projectId || deps.activeProjectId);
    deps.setRequestState(nextJob.status === "completed" ? "complete" : "running");
    deps.announceVoiceJobTerminalStatus(nextJob);
  } catch (caughtError) {
    deps.setRequestState("error");
    deps.setSourcePrepError(formatErrorMessage(caughtError, "Unable to create prepared narration"));
    deps.announceAssertive();
  }
}
