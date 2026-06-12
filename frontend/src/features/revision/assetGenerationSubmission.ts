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
  narrationBlockIsPreparedSelectionSpeakable,
} from "./preparedSourceNarration";
import {
  canonicalPreviewSpeechPlanHasBlocks,
  type CanonicalPreviewSpeechPlan,
} from "./revisionSpeechPlan";
import type { RevisionBlock } from "./revisionFilters";

export interface AssetNarrationGenerationOptions {
  useCurrentReviewSession?: boolean;
  fallbackSelectedBlockIds?: readonly string[];
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
  createTemporarySourceJob?: (
    temporarySourceId: string,
    request: CreateVoiceJobRequest,
  ) => Promise<VoiceJob>;
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

function uniqueOrderedBlockIds(blockIds: readonly string[], allowed: Set<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const blockId of blockIds) {
    const trimmed = blockId.trim();
    if (!trimmed) {
      continue;
    }
    if (!allowed.has(trimmed) || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function buildPreparedSourceSelectionDebugReasons(
  sourceBlockIds: Set<string>,
  sourceBlocks: PreparedSource["blocks"],
  requestedBlockIds: readonly string[],
): string[] {
  const reasons: string[] = [];
  const requestedNormalized = uniqueOrderedBlockIds(requestedBlockIds, sourceBlockIds);
  if (requestedBlockIds.length !== requestedNormalized.length) {
    reasons.push("selection contained invalid or duplicate block ids");
  }

  const sourceById = new Map(
    (sourceBlocks ?? []).map((block) => {
      return [block.id, block] as const;
    }),
  );
  for (const blockId of uniqueOrderedBlockIds(requestedBlockIds, new Set(requestedBlockIds))) {
    const sourceBlock = sourceById.get(blockId);
    if (!sourceBlock) {
      reasons.push(`requested blockId not in source scope: ${blockId}`);
      continue;
    }
    if (!narrationBlockIsPreparedSelectionSpeakable(sourceBlock)) {
      reasons.push(`requested blockId not speakable: ${blockId}`);
    }
  }

  return reasons;
}

interface PreparedSourceSelectionPayloadOptions {
  applyReviewSession: boolean;
  useCanonicalPreviewPlan: boolean;
  canonicalPreviewSpeechPlan: CanonicalPreviewSpeechPlan;
  narrationPreviewBlocks: readonly RevisionBlock[];
  fallbackSelectedBlockIds?: readonly string[];
}

interface PreparedSourceSelectionPayload {
  selectedBlockIds: string[];
  mismatchReasons: string[];
  sourceBlockCount: number;
  nonSkipSourceBlockCount: number;
  resolvedSelectedBlockCount: number;
  error?: string;
}

function resolvePreparedSourceSelectionPayload(
  source: PreparedSource,
  options: PreparedSourceSelectionPayloadOptions,
): PreparedSourceSelectionPayload {
  const sourceBlocks = source.blocks ?? [];
  const sourceBlockIds = new Set(sourceBlocks.map((block) => block.id));
  const sourceSpeakableBlockIds = sourceBlocks
    .filter((block) => narrationBlockIsPreparedSelectionSpeakable(block))
    .map((block) => block.id);
  const resolvedSelectedBlockIds = resolvePreparedSourceNarrationSelectedBlockIds(source, {
    applyReviewSession: options.applyReviewSession,
    useCanonicalPreviewPlan: options.useCanonicalPreviewPlan,
    canonicalPreviewSpeechPlan: options.canonicalPreviewSpeechPlan,
    narrationPreviewBlocks: options.narrationPreviewBlocks,
    fallbackSelectedBlockIds: options.fallbackSelectedBlockIds,
  });
  const canonicalRequestedBlockIds =
    options.useCanonicalPreviewPlan && options.applyReviewSession
      ? options.canonicalPreviewSpeechPlan.blockIds
      : [];
  const requestedForDebug =
    canonicalRequestedBlockIds.length > 0 ? canonicalRequestedBlockIds : resolvedSelectedBlockIds;
  const mismatchReasons = buildPreparedSourceSelectionDebugReasons(
    sourceBlockIds,
    sourceBlocks,
    requestedForDebug,
  );
  const selectedBlockIds = uniqueOrderedBlockIds(resolvedSelectedBlockIds, sourceBlockIds);
  if (selectedBlockIds.length > 0) {
    return {
      mismatchReasons,
      nonSkipSourceBlockCount: sourceSpeakableBlockIds.length,
      resolvedSelectedBlockCount: resolvedSelectedBlockIds.length,
      selectedBlockIds,
      sourceBlockCount: sourceBlocks.length,
    };
  }
  return resolveEmptyPreparedSourceSelectionPayload({
    applyReviewSession: options.applyReviewSession,
    mismatchReasons: [
      ...mismatchReasons,
      "selection was empty after scope validation; falling back to source speakable blocks",
    ],
    resolvedSelectedBlockCount: resolvedSelectedBlockIds.length,
    sourceBlockIds,
    sourceBlocks,
    sourceSpeakableBlockIds,
  });
}

function resolveEmptyPreparedSourceSelectionPayload({
  applyReviewSession,
  mismatchReasons,
  resolvedSelectedBlockCount,
  sourceBlockIds,
  sourceBlocks,
  sourceSpeakableBlockIds,
}: {
  applyReviewSession: boolean;
  mismatchReasons: string[];
  resolvedSelectedBlockCount: number;
  sourceBlockIds: Set<string>;
  sourceBlocks: PreparedSource["blocks"];
  sourceSpeakableBlockIds: readonly string[];
}): PreparedSourceSelectionPayload {
  const sourceBlockCount = sourceBlocks?.length ?? 0;
  if (applyReviewSession) {
    return {
      error: "Prepared source has no selected blocks for review session generation.",
      mismatchReasons,
      nonSkipSourceBlockCount: sourceSpeakableBlockIds.length,
      resolvedSelectedBlockCount,
      selectedBlockIds: [],
      sourceBlockCount,
    };
  }
  const selectedBlockIds = uniqueOrderedBlockIds(sourceSpeakableBlockIds, sourceBlockIds);
  if (selectedBlockIds.length === 0) {
    return {
      error: "Prepared source has no speakable blocks available for generation.",
      mismatchReasons,
      nonSkipSourceBlockCount: sourceSpeakableBlockIds.length,
      resolvedSelectedBlockCount,
      selectedBlockIds,
      sourceBlockCount,
    };
  }
  return {
    mismatchReasons,
    nonSkipSourceBlockCount: sourceSpeakableBlockIds.length,
    resolvedSelectedBlockCount,
    selectedBlockIds,
    sourceBlockCount,
  };
}

function preparedSourceProgressTargetId(source: PreparedSource): string {
  if (source.sourceOwner === "temporary" && source.temporarySourceId) {
    return `temporary-source:${source.temporarySourceId}`;
  }
  return `prepared:${source.id}`;
}

async function createPreparedNarrationJob(
  deps: SubmissionDependencies,
  source: PreparedSource,
  request: CreateVoiceJobRequest,
  applyReviewSession: boolean,
): Promise<VoiceJob> {
  if (source.sourceOwner === "temporary" && source.temporarySourceId) {
    return (deps.createTemporarySourceJob ?? deps.createPreparedSourceJob)(
      source.temporarySourceId,
      request,
    );
  }
  if (applyReviewSession) {
    return deps.createVoiceJob(request);
  }
  return deps.createPreparedSourceJob(source.id, request);
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
  if (book.sourceOwner === "temporary" && book.text?.trim()) {
    const content: BookSourceScopeContent = {
      bookSourceId: book.id,
      blocks: [],
      estimatedDurationMs: undefined,
      scope,
      sourceStructureValid: Boolean(book.structureVersion ?? book.wordSpans?.length),
      text: book.text,
      wordCount: book.wordCount,
      wordSpans: book.wordSpans ?? [],
    };
    deps.setBookScopeContent(content);
    return content;
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

  const request = buildBookNarrationJobRequest({
    applyReviewSession,
    book,
    deps,
    narrationText,
    scope,
    scopeContent,
    useCanonicalPreviewPlan,
  });

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
    const nextJob = await createBookNarrationJobForSource(deps, book, request);
    if (!nextJob) {
      return;
    }
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

function buildBookNarrationJobRequest({
  applyReviewSession,
  book,
  deps,
  narrationText,
  scope,
  scopeContent,
  useCanonicalPreviewPlan,
}: {
  applyReviewSession: boolean;
  book: BookSource;
  deps: SubmissionDependencies;
  narrationText: string;
  scope: BookScope;
  scopeContent: BookSourceScopeContent;
  useCanonicalPreviewPlan: boolean;
}): CreateVoiceJobRequest {
  const sessionOverrides = compactSpeechPolicyOverrides(deps.speechPolicyOverrides);
  return {
    ...deps.buildVoiceJobRequest(narrationText),
    bookSourceId: book.sourceOwner === "temporary" ? undefined : book.id,
    bookScope: scope,
    progressTargetId:
      book.sourceOwner === "temporary" && book.temporarySourceId
        ? `temporary-source:${book.temporarySourceId}`
        : progressTargetIdForBookScope(book.id, scope),
    sourceKind: "book",
    temporarySourceId: book.temporarySourceId,
    ...(applyReviewSession || (useCanonicalPreviewPlan && (scopeContent.blocks?.length ?? 0) > 0)
      ? { speechRenderApplied: true }
      : {}),
    ...(hasSpeechPolicyOverrides(sessionOverrides)
      ? { speechPolicyOverrides: sessionOverrides }
      : {}),
    ...(useCanonicalPreviewPlan ? { speechText: narrationText } : {}),
  };
}

async function createBookNarrationJobForSource(
  deps: SubmissionDependencies,
  book: BookSource,
  request: CreateVoiceJobRequest,
): Promise<VoiceJob | null> {
  if (book.sourceOwner !== "temporary" || !book.temporarySourceId) {
    return deps.createBookNarrationJob(book.id, request);
  }
  if (!deps.createTemporarySourceJob) {
    deps.setBookSourceError("Temporary source audio is not available in this build.");
    deps.setRequestState("error");
    return null;
  }
  return deps.createTemporarySourceJob(book.temporarySourceId, request);
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
    narrationPreviewBlocks: deps.narrationPreviewBlocks,
  });

  if ((applyReviewSession || useCanonicalPreviewPlan) && !speechText.trim()) {
    deps.setSourcePrepError("Prepared source has no speakable blocks.");
    return;
  }

  const selectionPayload = resolvePreparedSourceSelectionPayload(jobSource, {
    applyReviewSession,
    useCanonicalPreviewPlan,
    canonicalPreviewSpeechPlan: deps.canonicalPreviewSpeechPlan,
    narrationPreviewBlocks: deps.narrationPreviewBlocks,
    fallbackSelectedBlockIds: options.fallbackSelectedBlockIds,
  });

  if (selectionPayload.error) {
    deps.setSourcePrepError(selectionPayload.error);
    if (import.meta.env.DEV) {
      console.debug("Prepared source selection invalid with no fallback candidates", {
        sourceId: jobSource.id,
        sourceBlockCount: selectionPayload.sourceBlockCount,
        applyReviewSession,
        useCanonicalPreviewPlan,
        mismatchReasons: selectionPayload.mismatchReasons,
      });
    }
    return;
  }

  if (import.meta.env.DEV) {
    console.debug("Prepared source selection payload", {
      sourceId: jobSource.id,
      sourceBlockCount: selectionPayload.sourceBlockCount,
      nonSkipSourceBlockCount: selectionPayload.nonSkipSourceBlockCount,
      resolvedSelectedBlockCount: selectionPayload.resolvedSelectedBlockCount,
      selectedBlockCount: selectionPayload.selectedBlockIds.length,
      useCanonicalPreviewPlan,
      mismatchReasons: selectionPayload.mismatchReasons,
    });
  }

  const sessionOverrides = compactSpeechPolicyOverrides(deps.speechPolicyOverrides);
  const request: CreateVoiceJobRequest = {
    ...deps.buildVoiceJobRequest(speechText, jobSource),
    preparedSourceId: jobSource.sourceOwner === "temporary" ? undefined : jobSource.id,
    selectedBlockIds: selectionPayload.selectedBlockIds,
    sourceKind: jobSource.kind,
    temporarySourceId: jobSource.temporarySourceId,
    progressTargetId: preparedSourceProgressTargetId(jobSource),
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
    const nextJob = await createPreparedNarrationJob(deps, jobSource, request, applyReviewSession);
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
