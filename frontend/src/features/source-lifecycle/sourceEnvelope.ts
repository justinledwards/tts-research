import type { BookScope, BookSource, PreparedSource, SourceReadiness, VoiceJob } from "../../types";
import { bookScopeLabel, bookSourceName } from "../book-cinema/model";
import {
  generatedAudioLifecycleFromJob,
  type GeneratedAudioLifecycleState,
} from "../playback/generatedAudioLifecycle";
import {
  canonicalSourceLifecycleState,
  fallbackBookSourceReadiness,
  fallbackPreparedSourceReadiness,
  generatedAudioIsStale,
  hasSourcePolicyPinValues,
  sourceReadinessDetail,
  sourceReadinessLabel,
  type SourceAdapterKind,
  type SourceExtractionState,
  type SourceKind,
  type SourceLifecycleEnvelope,
  type SourceLifecycleSurface,
  type SourceNarrationState,
} from "./sourceLifecycleCore";

export function bookSourceLifecycleEnvelope(
  source: BookSource,
  options: {
    activeBlockId?: string | null;
    generated?: boolean;
    isActive?: boolean;
    job?: VoiceJob | null;
    lastOpenedSurface?: SourceLifecycleSurface;
    projectId?: string;
    selectedScope?: BookScope | null;
  } = {},
): SourceLifecycleEnvelope {
  const generatedAudioState = sourceGeneratedAudioState({
    generated: options.generated,
    job: options.job,
    sourceUpdatedAt: source.updatedAt,
  });
  const narratableScopeCount = bookNarratableScopeCount(source);
  const extractionState = extractionStateForStatus(source.status, bookHasExtractedContent(source));
  const sourceReadiness = fallbackBookSourceReadiness(source);
  const narrationState = narrationStateForSource({
    generatedAudioState,
    narratableScopeCount,
    ready: source.status === "ready",
    status: source.status,
  });
  const canonicalState = canonicalSourceLifecycleState({
    extractionState,
    generatedAudioState,
    narrationState,
  });
  return {
    activeBlockId: options.activeBlockId ?? null,
    adapterKind: bookAdapterKind(source.kind),
    canonicalState,
    disabledReason: sourceReadinessDisabledReason(sourceReadiness, source.error),
    extractionState,
    generatedAudioState,
    isActive: Boolean(options.isActive),
    language: sourceLanguage(source),
    lastOpenedSurface: options.lastOpenedSurface ?? "Workspace",
    narratableUnitCount: narratableScopeCount,
    narrationState,
    policyScope: sourcePolicyScope(source),
    projectId: options.projectId ?? source.projectId,
    selectedScope: options.selectedScope ? bookScopeLabel(options.selectedScope) : "Default scope",
    sourceId: source.id,
    sourceKind: source.kind === "html" ? "website" : "book",
    sourceReadiness,
    title: bookSourceName(source),
    updatedAt: source.updatedAt,
    wordCount: source.wordCount,
  };
}

export function preparedSourceLifecycleEnvelope(
  source: PreparedSource,
  options: {
    activeBlockId?: string | null;
    generated?: boolean;
    isActive?: boolean;
    job?: VoiceJob | null;
    lastOpenedSurface?: SourceLifecycleSurface;
    projectId?: string;
  } = {},
): SourceLifecycleEnvelope {
  const generatedAudioState = sourceGeneratedAudioState({
    generated: options.generated,
    job: options.job,
    sourceUpdatedAt: source.updatedAt,
  });
  const extractionState = extractionStateForStatus(
    source.status,
    source.blockCount > 0 || source.wordCount > 0 || Boolean(source.text),
  );
  const sourceReadiness = fallbackPreparedSourceReadiness(source);
  const narrationState = narrationStateForSource({
    generatedAudioState,
    narratableScopeCount: source.summary.spokenBlockCount,
    ready: source.status === "ready",
    status: source.status,
  });
  const canonicalState = canonicalSourceLifecycleState({
    extractionState,
    generatedAudioState,
    narrationState,
  });
  return {
    activeBlockId: options.activeBlockId ?? null,
    adapterKind: preparedSourceAdapterKind(source),
    canonicalState,
    disabledReason: sourceReadinessDisabledReason(sourceReadiness, source.error),
    extractionState,
    generatedAudioState,
    isActive: Boolean(options.isActive),
    language: sourceLanguage(source),
    lastOpenedSurface: options.lastOpenedSurface ?? "Workspace",
    narratableUnitCount: source.summary.spokenBlockCount,
    narrationState,
    policyScope: sourcePolicyScope(source),
    projectId: options.projectId ?? source.projectId,
    selectedScope: "Full source",
    sourceId: source.id,
    sourceKind: preparedSourceKind(source),
    sourceReadiness,
    title: source.title ?? source.sourceName,
    updatedAt: source.updatedAt,
    wordCount: source.wordCount,
  };
}

export function draftSourceLifecycleEnvelope({
  activeBlockId = null,
  generatedAudioState = "missing",
  projectId,
  text,
}: {
  activeBlockId?: string | null;
  generatedAudioState?: GeneratedAudioLifecycleState;
  projectId: string;
  text: string;
}): SourceLifecycleEnvelope {
  const hasText = text.trim().length > 0;
  const extractionState: SourceExtractionState = hasText ? "imported" : "new";
  const narrationState: SourceNarrationState = hasText ? "previewable" : "new";
  const canonicalState = canonicalSourceLifecycleState({
    extractionState,
    generatedAudioState,
    narrationState,
  });
  return {
    activeBlockId,
    adapterKind: "text",
    canonicalState,
    extractionState,
    generatedAudioState,
    language: "Project default",
    lastOpenedSurface: "Workspace",
    narratableUnitCount: hasText ? 1 : 0,
    narrationState,
    policyScope: "project",
    projectId,
    selectedScope: "Draft text",
    sourceId: "draft",
    sourceKind: "draft",
    sourceReadiness: {
      confidence: hasText ? "medium" : "low",
      detail: hasText
        ? "Draft text is available locally."
        : "Choose, paste, or prepare a source before continuing.",
      sourceType: "draft",
      state: hasText ? "ready" : "noSource",
      title: "Draft text",
    },
    title: "Draft text",
    wordCount: hasText ? text.trim().split(/\s+/).length : 0,
  };
}

function sourceReadinessDisabledReason(
  readiness: SourceReadiness,
  legacyError: string | undefined,
): string | undefined {
  if (readiness.state === "ready") {
    return undefined;
  }
  if (legacyError) {
    return legacyError;
  }
  return `${sourceReadinessLabel(readiness)}: ${sourceReadinessDetail(readiness)}`;
}

function sourceGeneratedAudioState({
  generated,
  job,
  sourceUpdatedAt,
}: {
  generated?: boolean;
  job?: VoiceJob | null;
  sourceUpdatedAt: string;
}): GeneratedAudioLifecycleState {
  if (generated && !job) {
    return "ready";
  }
  const stale = generatedAudioIsStale({
    audioUpdatedAt: job?.completedAt ?? job?.updatedAt,
    sourceUpdatedAt,
  });
  return generatedAudioLifecycleFromJob({ job, stale });
}

function extractionStateForStatus(
  status: string,
  hasExtractedContent: boolean,
): SourceExtractionState {
  if (status === "failed") {
    return "failed";
  }
  if (!hasExtractedContent) {
    return status === "ready" ? "imported" : "extracting";
  }
  return "extracted";
}

function narrationStateForSource({
  generatedAudioState,
  narratableScopeCount,
  ready,
  status,
}: {
  generatedAudioState: GeneratedAudioLifecycleState;
  narratableScopeCount: number;
  ready: boolean;
  status: string;
}): SourceNarrationState {
  if (status === "failed" || generatedAudioState === "failed") {
    return "failed";
  }
  if (generatedAudioState === "stale" || generatedAudioState === "degraded") {
    return "stale";
  }
  if (generatedAudioState === "ready") {
    return "audioReady";
  }
  if (generatedAudioState === "queued" || generatedAudioState === "generating") {
    return "generating";
  }
  if (!ready) {
    return "prepared";
  }
  return narratableScopeCount > 0 ? "narratable" : "reviewable";
}

function preparedSourceKind(source: PreparedSource): SourceKind {
  if (source.kind === "url") {
    return "website";
  }
  if (source.kind === "text") {
    return "text";
  }
  if (source.kind === "book") {
    return "book";
  }
  return "document";
}

function preparedSourceAdapterKind(source: PreparedSource): SourceAdapterKind {
  if (source.kind === "url") {
    return "url";
  }
  if (source.kind === "text") {
    return "text";
  }
  if (source.kind === "book") {
    return "book";
  }
  const format = (
    source.sourceFormat ??
    source.sourceContentType ??
    source.sourceName
  ).toLowerCase();
  if (format.includes("pdf")) {
    return "pdf";
  }
  if (format.includes("epub")) {
    return "epub";
  }
  if (format.includes("docx")) {
    return "docx";
  }
  if (format.includes("markdown") || format.endsWith(".md")) {
    return "markdown";
  }
  if (format.includes("html") || format.endsWith(".html") || format.endsWith(".htm")) {
    return "html";
  }
  return "unknown";
}

function bookAdapterKind(kind: BookSource["kind"]): SourceAdapterKind {
  if (kind === "html") {
    return "html";
  }
  if (kind === "image") {
    return "image";
  }
  return kind;
}

function bookNarratableScopeCount(source: BookSource): number {
  return (
    source.sections?.filter((section) => section.isNarratable).length ??
    source.chapters?.filter((chapter) => chapter.isNarratable !== false).length ??
    source.chapterCount
  );
}

function bookHasExtractedContent(source: BookSource): boolean {
  return (
    bookNarratableScopeCount(source) > 0 ||
    source.pageCount > 0 ||
    source.wordCount > 0 ||
    Boolean(source.text)
  );
}

function sourcePolicyScope(source: BookSource | PreparedSource): "project" | "source" {
  return hasSourcePolicyPinValues({
    overrides: source.sourceSpeechPolicyOverrides,
    profile: source.sourceSpeechPolicyProfile,
  })
    ? "source"
    : "project";
}

function sourceLanguage(source: BookSource | PreparedSource): string {
  const metadataLanguage =
    "metadata" in source && typeof source.metadata?.language === "string"
      ? source.metadata.language
      : null;
  return metadataLanguage?.trim() ? metadataLanguage : "Project default";
}
