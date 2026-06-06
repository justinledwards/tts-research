import { describe, expect, it, vi } from "vitest";
import type { BookSource, BookSourceScopeContent, PreparedSource, VoiceJob } from "../../types";
import { progressTargetIdForBookScope } from "../../appHelpers";
import type { RevisionBlock } from "./revisionFilters";
import { buildCanonicalPreviewSpeechPlan } from "./revisionSpeechPlan";
import {
  submitBookNarrationJob,
  submitPreparedSourceJob,
  submitVoiceJob,
} from "./assetGenerationSubmission";
import type { SubmissionDependencies } from "./assetGenerationSubmission";

type PreparedSourceBlock = NonNullable<PreparedSource["blocks"]>[number];

function revisionBlock(overrides: Partial<RevisionBlock> = {}): RevisionBlock {
  return {
    confidence: 0.96,
    endOffset: 0,
    estimatedDurationMs: 1,
    id: "block-id",
    index: 1,
    kind: "body",
    label: "Revision block",
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "Spoken",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: 1,
    sourceSection: "Body",
    speakMode: "speak",
    spokenText: "Spoken block text.",
    startOffset: 0,
    status: "waiting",
    text: "Spoken block text.",
    warnings: [],
    speechPolicy: {
      explanation: "Default",
      mode: "speak",
      profile: "default",
    },
    ...overrides,
  } as RevisionBlock & { speechPolicy: { explanation: string; mode: string; profile: string } };
}

function baseBookSource(overrides: Partial<BookSource> = {}): BookSource {
  return {
    chapterCount: 1,
    createdAt: "2026-06-01T10:00:00Z",
    error: undefined,
    id: "book-1",
    kind: "pdf",
    projectId: "project-1",
    sourceBytes: 1024,
    sourceFile: "book.pdf",
    status: "ready",
    sourceSpeechPolicyProfile: "default",
    updatedAt: "2026-06-01T10:00:00Z",
    wordCount: 1000,
    pageCount: 1,
    ...overrides,
  };
}

function basePreparedSource(overrides: Partial<PreparedSource> = {}): PreparedSource {
  return {
    blockCount: 1,
    blocks: [
      {
        ...revisionBlock({ id: "source-block", index: 1 }),
      } as unknown as PreparedSourceBlock,
    ],
    createdAt: "2026-06-01T10:00:00Z",
    id: "prepared-source-1",
    kind: "text",
    projectId: "project-1",
    speechPolicyProfile: "default",
    sourceName: "Prepared source",
    segmentCount: 1,
    status: "ready",
    summary: {
      citationSkipCount: 0,
      headingCount: 0,
      sentenceSegmentCount: 1,
      skippedBlockCount: 0,
      spokenBlockCount: 1,
    },
    text: "Prepared source text.",
    speechText: "Prepared source speech text.",
    updatedAt: "2026-06-01T10:00:00Z",
    wordCount: 3,
    ...overrides,
  };
}

function completeJob(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    currentTimeSec: 0,
    createdAt: "2026-06-01T10:00:00Z",
    durationMs: 1234,
    finished: true,
    hidden: false,
    id: "job-1",
    inputText: "Generated text",
    optimizedText: "Generated text",
    optimizer: "rules",
    progress: {
      activeStage: "synthesis",
      currentSegment: 1,
      detail: "Generating",
      message: "Generating",
      totalSegments: 2,
    },
    projectId: "project-1",
    provider: "mock",
    retries: {
      attempts: 0,
      currentSegment: 0,
      maxRetries: 0,
      segmentAttempts: 0,
      totalSegments: 0,
    },
    stages: {
      checker: "done",
      optimization: "done",
      synthesis: "done",
    },
    status: "completed",
    audioUrl: "/audio.wav",
    contentType: "audio/wav",
    speechText: "",
    voice: "default",
    voiceCheck: {
      complete: true,
      needsResume: false,
      provider: "mock",
      reason: "",
      similarity: 1,
      transcript: "Generated text",
    },
    ...overrides,
  } as VoiceJob;
}

function makeRunningState() {
  const requestState: string[] = [];
  const errors: (string | null)[] = [];
  const bookSourceErrors: (string | null)[] = [];
  const sourcePrepErrors: (string | null)[] = [];
  const terminalAnnouncements: VoiceJob[] = [];
  const textAnnouncements: string[] = [];
  let bookScopeContentState: BookSourceScopeContent | null = null;
  const preparedSourcesState: PreparedSource[] = [];

  const deps: SubmissionDependencies = {
    activeProjectId: "project-1",
    hasRevisionSessionChanges: false,
    speechPolicyOverrides: {},
    speechPolicyProfile: "default",
    reviewedNarrationSpeechText: "",
    canonicalPreviewSpeechPlan: buildCanonicalPreviewSpeechPlan([]),
    text: "Draft text.",
    narrationPreviewBlocks: [],
    bookScopeContent: null,
    buildVoiceJobRequest: (sourceText) => ({ text: sourceText, projectId: "project-1" }),
    applySpeechPolicyToCreateVoiceJobRequest: (request, options) => ({
      ...request,
      speechPolicyProfile: options.speechPolicyProfile,
      speechPolicyOverrides: options.speechPolicyOverrides,
    }),
    createVoiceJob: vi.fn(),
    createBookNarrationJob: vi.fn(),
    createPreparedSourceJob: vi.fn(),
    getBookSourceScope: vi.fn(),
    getPreparedSource: vi.fn(),
    isApiNotFoundError: vi.fn(),
    announcePolite: () => textAnnouncements.push("polite"),
    announceAssertive: () => textAnnouncements.push("assertive"),
    announceVoiceJobTerminalStatus: (job: VoiceJob) => terminalAnnouncements.push(job),
    refreshProjectJobs: vi.fn(),
    setRequestState: (state) => requestState.push(state),
    setError: (error) => errors.push(error),
    setBookSourceError: (error) => bookSourceErrors.push(error),
    setSourcePrepError: (error) => sourcePrepErrors.push(error),
    setPlaybackCursorSec: vi.fn(),
    setIsPlaybackActive: vi.fn(),
    setActiveDemoProjectId: vi.fn(),
    setJob: vi.fn(),
    setContentMode: vi.fn(),
    setSelectedBookSourceId: vi.fn(),
    setSelectedBookScope: vi.fn(),
    setSourceMode: vi.fn(),
    setText: vi.fn(),
    setSelectedPreparedSourceId: vi.fn(),
    setBookScopeContent: (content) => {
      bookScopeContentState =
        typeof content === "function" ? content(bookScopeContentState) : content;
    },
    setPreparedSources: (updater) => {
      preparedSourcesState.splice(0, preparedSourcesState.length, ...updater(preparedSourcesState));
    },
    clearMissingBookSource: vi.fn(),
  };

  return {
    deps,
    requestState,
    errors,
    bookSourceErrors,
    sourcePrepErrors,
    terminalAnnouncements,
    textAnnouncements,
    get bookScopeContentState() {
      return bookScopeContentState;
    },
    get preparedSourcesState() {
      return preparedSourcesState;
    },
  };
}

describe("asset-generation submission orchestration", () => {
  it("submitVoiceJob preserves long fallback draft text and applies speech policy request helpers", async () => {
    const state = makeRunningState();
    const longDraftText = "x".repeat(25_000);
    state.deps.text = longDraftText;
    state.deps.speechPolicyOverrides = { mode: "speak" };
    state.deps.speechPolicyProfile = "accessibility";
    const job = completeJob({ projectId: "project-1" });
    state.deps.createVoiceJob = vi.fn().mockResolvedValue(job);
    await submitVoiceJob(state.deps);

    expect(state.requestState).toEqual(["running", "complete"]);
    expect(state.deps.createVoiceJob).toHaveBeenCalledOnce();
    const request = vi.mocked(state.deps.createVoiceJob).mock.calls[0]?.[0];
    expect(request.text).toBe(longDraftText);
    expect(request.speechPolicyProfile).toBe("accessibility");
    expect(request.speechPolicyOverrides).toEqual({ mode: "speak" });
    expect(state.terminalAnnouncements).toEqual([job]);
  });

  it("submitVoiceJob routes errors into error state", async () => {
    const state = makeRunningState();
    state.deps.createVoiceJob = vi.fn().mockRejectedValue(new Error("Unable to create"));
    await submitVoiceJob(state.deps);

    expect(state.requestState).toEqual(["running", "error"]);
    expect(state.errors.at(-1)).toBe("Unable to create");
    expect(state.terminalAnnouncements).toHaveLength(0);
  });

  it("submits book narration from cached scope content without reloading and builds request payload", async () => {
    const state = makeRunningState();
    const scope = { type: "book" } as const;
    const cachedScopeContent: BookSourceScopeContent = {
      bookSourceId: "book-1",
      scope,
      sourceStructureValid: true,
      text: "Cached narration scope text.",
      wordSpans: [],
      wordCount: 5,
    };
    state.deps.bookScopeContent = cachedScopeContent;
    state.deps.createBookNarrationJob = vi.fn().mockResolvedValue(completeJob());
    const book = baseBookSource();

    await submitBookNarrationJob(state.deps, book, scope);

    expect(state.deps.getBookSourceScope).not.toHaveBeenCalled();
    expect(state.deps.createBookNarrationJob).toHaveBeenCalledOnce();
    const request = vi.mocked(state.deps.createBookNarrationJob).mock.calls[0]?.[1];
    expect(request).toMatchObject({
      text: "Cached narration scope text.",
      bookSourceId: "book-1",
      bookScope: scope,
      progressTargetId: progressTargetIdForBookScope("book-1", scope),
      sourceKind: "book",
    });
  });

  it("loads unloaded book scope content before submitting book narration", async () => {
    const state = makeRunningState();
    const scope = { type: "book" } as const;
    const loadedScopeContent: BookSourceScopeContent = {
      bookSourceId: "book-1",
      scope,
      sourceStructureValid: true,
      text: "Loaded scope narration text.",
      wordSpans: [],
      wordCount: 6,
    };
    state.deps.getBookSourceScope = vi.fn().mockResolvedValue({
      ...loadedScopeContent,
    });
    state.deps.createBookNarrationJob = vi.fn().mockResolvedValue(completeJob());
    const book = baseBookSource();

    await submitBookNarrationJob(state.deps, book, scope);

    expect(state.deps.getBookSourceScope).toHaveBeenCalledWith("book-1", scope);
    expect(state.deps.createBookNarrationJob).toHaveBeenCalledOnce();
    const request = vi.mocked(state.deps.createBookNarrationJob).mock.calls[0]?.[1];
    expect(request.text).toBe("Loaded scope narration text.");
  });

  it("handles missing book scope load with 404 by clearing missing source and skipping submission", async () => {
    const state = makeRunningState();
    const scope = { type: "book" } as const;
    const clearMissingBookSource = vi.fn();
    const notFound = new Error("not-found");
    state.deps.getBookSourceScope = vi.fn().mockRejectedValue(notFound);
    state.deps.isApiNotFoundError = vi.fn().mockReturnValue(true);
    state.deps.clearMissingBookSource = clearMissingBookSource;
    const book = baseBookSource();

    await submitBookNarrationJob(state.deps, book, scope);

    expect(clearMissingBookSource).toHaveBeenCalledOnce();
    expect(clearMissingBookSource).toHaveBeenCalledWith("book-1");
    expect(state.deps.createBookNarrationJob).not.toHaveBeenCalled();
  });

  it("does not submit book narration for non-ready book sources", async () => {
    const state = makeRunningState();
    const scope = { type: "book" } as const;
    const book = baseBookSource({ status: "failed", error: "book failed" });

    await submitBookNarrationJob(state.deps, book, scope);

    expect(state.deps.createBookNarrationJob).not.toHaveBeenCalled();
    expect(state.bookSourceErrors.at(-1)).toBe("book failed");
  });

  it("hydrates incomplete prepared source when not using current review session and submits via prepared-source job", async () => {
    const state = makeRunningState();
    const source = basePreparedSource({
      text: "Prepared source text.",
      speechText: undefined,
      blocks: [
        {
          ...revisionBlock({ id: "source-block" }),
        } as unknown as PreparedSourceBlock,
      ],
    });
    const hydratedSource = basePreparedSource({
      id: source.id,
      text: "Prepared source text.",
      speechText: "Hydrated speech text.",
      blocks: source.blocks,
    });
    state.deps.getPreparedSource = vi.fn().mockResolvedValue(hydratedSource);
    state.deps.createPreparedSourceJob = vi.fn().mockResolvedValue(completeJob());

    await submitPreparedSourceJob(state.deps, source, { useCurrentReviewSession: false });

    expect(state.deps.getPreparedSource).toHaveBeenCalledOnce();
    expect(state.deps.createPreparedSourceJob).toHaveBeenCalledOnce();
    expect(state.deps.createVoiceJob).not.toHaveBeenCalled();
    const request = vi.mocked(state.deps.createPreparedSourceJob).mock.calls[0]?.[1];
    expect(request).toMatchObject({
      preparedSourceId: source.id,
      progressTargetId: `prepared:${source.id}`,
      sourceKind: "text",
      selectedBlockIds: ["source-block"],
    });
    expect(request.text).toBe("Hydrated speech text.");
    expect(state.preparedSourcesState.length).toBeGreaterThanOrEqual(1);
  });

  it("uses active review session for prepared narration and submits through createVoiceJob with canonical text", async () => {
    const state = makeRunningState();
    state.deps.hasRevisionSessionChanges = true;
    state.deps.canonicalPreviewSpeechPlan = buildCanonicalPreviewSpeechPlan([
      revisionBlock({ id: "canonical-block" }),
    ]);
    state.deps.reviewedNarrationSpeechText = "Reviewed narration.";
    const source = basePreparedSource({
      speechText: "Prepared source speech text.",
      blocks: [
        {
          ...revisionBlock({ id: "canonical-block" }),
        } as unknown as PreparedSourceBlock,
      ],
    });
    const targetVoiceJob = completeJob({ projectId: "project-1" });
    state.deps.createVoiceJob = vi.fn().mockResolvedValue(targetVoiceJob);

    await submitPreparedSourceJob(state.deps, source);

    expect(state.deps.createVoiceJob).toHaveBeenCalledOnce();
    expect(state.deps.createPreparedSourceJob).not.toHaveBeenCalled();
    const request = vi.mocked(state.deps.createVoiceJob).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      preparedSourceId: source.id,
      progressTargetId: `prepared:${source.id}`,
      sourceKind: "text",
      speechRenderApplied: true,
      selectedBlockIds: ["canonical-block"],
      text: state.deps.canonicalPreviewSpeechPlan.text,
    });
  });

  it("falls back to non-skip source-local blocks when canonical selection is stale during active review session", async () => {
    const state = makeRunningState();
    state.deps.hasRevisionSessionChanges = true;
    state.deps.canonicalPreviewSpeechPlan = buildCanonicalPreviewSpeechPlan([
      revisionBlock({ id: "stale-canonical-id" }),
      revisionBlock({ id: "source-skip-id", speakMode: "skip" }),
    ]);
    state.deps.reviewedNarrationSpeechText = "Reviewed narration.";
    const source = basePreparedSource({
      speechText: "Prepared source speech text.",
      blocks: [
        {
          ...revisionBlock({
            id: "source-speaking-id",
            spokenText: "This should remain selected.",
          }),
        } as unknown as PreparedSourceBlock,
        {
          ...revisionBlock({
            id: "source-skip-id",
            speakMode: "skip",
            spokenText: "Skip this block.",
          }),
        } as unknown as PreparedSourceBlock,
      ],
    });
    state.deps.narrationPreviewBlocks = [
      revisionBlock({ id: "source-speaking-id", spokenText: "This should remain selected." }),
      revisionBlock({ id: "source-skip-id", speakMode: "skip", spokenText: "Skip this block." }),
    ];
    const targetVoiceJob = completeJob({ projectId: "project-1" });
    state.deps.createVoiceJob = vi.fn().mockResolvedValue(targetVoiceJob);

    await submitPreparedSourceJob(state.deps, source);

    expect(state.deps.createVoiceJob).toHaveBeenCalledOnce();
    expect(state.deps.createPreparedSourceJob).not.toHaveBeenCalled();
    const request = vi.mocked(state.deps.createVoiceJob).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      preparedSourceId: source.id,
      progressTargetId: `prepared:${source.id}`,
      sourceKind: "text",
      speechRenderApplied: true,
      selectedBlockIds: ["source-speaking-id"],
      text: "This should remain selected.",
    });
  });

  it("filters review-session skipped IDs from payload and text even when source block remains speakable", async () => {
    const state = makeRunningState();
    state.deps.hasRevisionSessionChanges = true;
    state.deps.canonicalPreviewSpeechPlan = buildCanonicalPreviewSpeechPlan([
      revisionBlock({ id: "stale-canonical-id" }),
      revisionBlock({ id: "source-skip-id", speakMode: "speak" }),
    ]);
    const source = basePreparedSource({
      speechText: "Prepared source speech text.",
      blocks: [
        {
          ...revisionBlock({
            id: "source-speaking-id",
            spokenText: "Keep this block.",
            speakMode: "speak",
          }),
        } as unknown as PreparedSourceBlock,
        {
          ...revisionBlock({
            id: "source-skip-id",
            speakMode: "speak",
            spokenText: "Review skip this block.",
          }),
        } as unknown as PreparedSourceBlock,
      ],
    });
    state.deps.reviewedNarrationSpeechText = "Reviewed narration.";
    state.deps.narrationPreviewBlocks = [
      revisionBlock({
        id: "source-speaking-id",
        spokenText: "Keep this block.",
        status: "waiting",
      }),
      revisionBlock({
        id: "source-skip-id",
        spokenText: "Review skip this block.",
        status: "skipped",
      }),
    ];
    const targetVoiceJob = completeJob({ projectId: "project-1" });
    state.deps.createVoiceJob = vi.fn().mockResolvedValue(targetVoiceJob);

    await submitPreparedSourceJob(state.deps, source);

    expect(state.deps.createVoiceJob).toHaveBeenCalledOnce();
    const request = vi.mocked(state.deps.createVoiceJob).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      preparedSourceId: source.id,
      progressTargetId: `prepared:${source.id}`,
      sourceKind: "text",
      speechRenderApplied: true,
      selectedBlockIds: ["source-speaking-id"],
      text: "Keep this block.",
    });
    expect(request.selectedBlockIds).not.toContain("source-skip-id");
  });

  it("does not submit prepared-source narration for non-ready prepared source", async () => {
    const state = makeRunningState();
    const source = basePreparedSource({ status: "failed", error: "prepared failed" });
    await submitPreparedSourceJob(state.deps, source);

    expect(state.deps.createVoiceJob).not.toHaveBeenCalled();
    expect(state.deps.createPreparedSourceJob).not.toHaveBeenCalled();
    expect(state.sourcePrepErrors.at(-1)).toBe("prepared failed");
  });
});
