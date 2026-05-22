import type { BookSource, PreparedSource, VoiceJob } from "../../types";
import { formatLocaleNumber } from "../i18n";

export const SOURCE_LIFECYCLE_STATES = [
  "imported",
  "extracting",
  "extracted",
  "prepared",
  "reviewable",
  "previewable",
  "narratable",
  "generated",
  "stale",
  "failed",
] as const;

export type SourceLifecycleState = (typeof SOURCE_LIFECYCLE_STATES)[number];

export type SourceLifecycleType =
  | "book"
  | "document"
  | "website"
  | "pdf"
  | "epub"
  | "docx"
  | "markdown"
  | "prepared"
  | "text"
  | "unknown";

export interface SourceLifecycleRouteState {
  canReview: boolean;
  canPreview: boolean;
  canCinema: boolean;
  reviewDisabledReason?: string;
  previewDisabledReason?: string;
  cinemaDisabledReason?: string;
}

export interface SourceCardModel {
  id: string;
  owner: "book" | "prepared";
  title: string;
  type: SourceLifecycleType;
  typeLabel: string;
  lifecycleState: SourceLifecycleState;
  lifecycleLabel: string;
  lifecycleDetail: string;
  visibleLabel: string;
  accessibleLabel: string;
  extractionState: string;
  narratableScopeCount: number;
  narratableScopeLabel: string;
  activeStateLabel: string;
  isActive: boolean;
  hasPolicyPin: boolean;
  policyPinLabel: string;
  appliesToCopy: string;
  expectedStateTransition: string;
  enabledDisabledReason: string;
  routeState: SourceLifecycleRouteState;
  updatedAt: string;
}

export function sourceLifecycleModelsFromSources({
  activeBookSourceId,
  activePreparedSourceId,
  bookSources,
  jobs = [],
  preparedSources,
}: {
  activeBookSourceId?: string | null;
  activePreparedSourceId?: string | null;
  bookSources: BookSource[];
  jobs?: VoiceJob[];
  preparedSources: PreparedSource[];
}): SourceCardModel[] {
  const generatedSourceIds = generatedSourceIdSet(jobs);
  const models: SourceCardModel[] = [
    ...preparedSources.map((source) =>
      preparedSourceLifecycleModel(source, {
        generated: generatedSourceIds.has(`prepared:${source.id}`),
        isActive: source.id === activePreparedSourceId,
      }),
    ),
    ...bookSources.map((source) =>
      bookSourceLifecycleModel(source, {
        generated: generatedSourceIds.has(`book:${source.id}`),
        isActive: source.id === activeBookSourceId,
      }),
    ),
  ];
  // Stable project source ordering is easier to audit when newest sources are first.
  // eslint-disable-next-line unicorn/no-array-sort
  return [...models].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function preparedSourceLifecycleModel(
  source: PreparedSource,
  options: { generated?: boolean; isActive?: boolean } = {},
): SourceCardModel {
  const title = source.title ?? source.sourceName;
  const hasExtractedContent = source.blockCount > 0 || source.wordCount > 0 || Boolean(source.text);
  const narratableScopeCount = source.summary.spokenBlockCount;
  const type = preparedSourceLifecycleType(source);
  const routeState = readyRouteState(source.status === "ready", source.error, "Prepared source");
  const lifecycleState = sourceLifecycleState({
    generated: options.generated,
    hasExtractedContent,
    isReady: source.status === "ready",
    narratableScopeCount,
    status: source.status,
  });

  return {
    id: source.id,
    owner: "prepared",
    title,
    type,
    typeLabel: sourceTypeLabel(type),
    lifecycleState,
    lifecycleLabel: sourceLifecycleLabel(lifecycleState),
    lifecycleDetail: sourceLifecycleDetail(lifecycleState),
    visibleLabel: title,
    accessibleLabel: `${title}, ${sourceTypeLabel(type)} source`,
    extractionState: extractionStateLabel(lifecycleState, source.status),
    narratableScopeCount,
    narratableScopeLabel: narratableScopeLabel(narratableScopeCount, "block"),
    activeStateLabel: options.isActive ? "Active source" : "Available source",
    isActive: Boolean(options.isActive),
    hasPolicyPin: hasSourcePolicyPin(source),
    policyPinLabel: hasSourcePolicyPin(source) ? "Policy pinned" : "Project policy",
    appliesToCopy: sourceAppliesToCopy(type, title),
    expectedStateTransition: routeState.canReview
      ? "Reopens this source in Review without creating a duplicate import."
      : "Source must finish extraction before Review, Preview, or Cinema routes are available.",
    enabledDisabledReason: routeState.canReview
      ? "Ready for Review, Preview, and Cinema."
      : (routeState.reviewDisabledReason ?? "Prepared source is unavailable."),
    routeState,
    updatedAt: source.updatedAt,
  };
}

export function bookSourceLifecycleModel(
  source: BookSource,
  options: { generated?: boolean; isActive?: boolean } = {},
): SourceCardModel {
  const title = source.title ?? source.sourceFile;
  const narratableScopeCount =
    source.sections?.filter((section) => section.isNarratable).length ??
    source.chapters?.filter((chapter) => chapter.isNarratable !== false).length ??
    source.chapterCount;
  const hasExtractedContent =
    narratableScopeCount > 0 ||
    source.pageCount > 0 ||
    source.wordCount > 0 ||
    Boolean(source.text);
  const type = bookSourceLifecycleType(source.kind);
  const routeState = readyRouteState(source.status === "ready", source.error, "Book source");
  const lifecycleState = sourceLifecycleState({
    generated: options.generated,
    hasExtractedContent,
    isReady: source.status === "ready",
    narratableScopeCount,
    status: source.status,
  });

  return {
    id: source.id,
    owner: "book",
    title,
    type,
    typeLabel: sourceTypeLabel(type),
    lifecycleState,
    lifecycleLabel: sourceLifecycleLabel(lifecycleState),
    lifecycleDetail: sourceLifecycleDetail(lifecycleState),
    visibleLabel: title,
    accessibleLabel: `${title}, ${sourceTypeLabel(type)} source`,
    extractionState: extractionStateLabel(lifecycleState, source.status),
    narratableScopeCount,
    narratableScopeLabel: narratableScopeLabel(narratableScopeCount, "scope"),
    activeStateLabel: options.isActive ? "Active source" : "Available source",
    isActive: Boolean(options.isActive),
    hasPolicyPin: hasSourcePolicyPin(source),
    policyPinLabel: hasSourcePolicyPin(source) ? "Policy pinned" : "Project policy",
    appliesToCopy: sourceAppliesToCopy(type, title),
    expectedStateTransition: routeState.canReview
      ? "Reopens this book in Review using its default narratable scope."
      : "Book extraction must complete before Review, Preview, or Cinema routes are available.",
    enabledDisabledReason: routeState.canReview
      ? "Ready for Review, Preview, and Cinema."
      : (routeState.reviewDisabledReason ?? "Book source is unavailable."),
    routeState,
    updatedAt: source.updatedAt,
  };
}

function sourceLifecycleState({
  generated,
  hasExtractedContent,
  isReady,
  narratableScopeCount,
  status,
}: {
  generated?: boolean;
  hasExtractedContent: boolean;
  isReady: boolean;
  narratableScopeCount: number;
  status: string;
}): SourceLifecycleState {
  if (status === "failed") {
    return "failed";
  }
  if (!hasExtractedContent) {
    return status === "ready" ? "stale" : "imported";
  }
  if (!isReady) {
    return "extracting";
  }
  if (generated) {
    return "generated";
  }
  if (narratableScopeCount > 0) {
    return "narratable";
  }
  return "reviewable";
}

function readyRouteState(
  isReady: boolean,
  error: string | undefined,
  noun: string,
): SourceLifecycleRouteState {
  const disabledReason = isReady ? undefined : (error ?? `${noun} is not ready yet.`);
  return {
    canCinema: isReady,
    canPreview: isReady,
    canReview: isReady,
    cinemaDisabledReason: disabledReason,
    previewDisabledReason: disabledReason,
    reviewDisabledReason: disabledReason,
  };
}

function preparedSourceLifecycleType(source: PreparedSource): SourceLifecycleType {
  if (source.kind === "url") {
    return "website";
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
  return "document";
}

function bookSourceLifecycleType(kind: BookSource["kind"]): SourceLifecycleType {
  if (kind === "html") {
    return "website";
  }
  if (kind === "image") {
    return "document";
  }
  return kind;
}

function sourceLifecycleLabel(state: SourceLifecycleState): string {
  switch (state) {
    case "imported": {
      return "Imported";
    }
    case "extracting": {
      return "Extracting";
    }
    case "extracted": {
      return "Extracted";
    }
    case "prepared": {
      return "Prepared";
    }
    case "reviewable": {
      return "Reviewable";
    }
    case "previewable": {
      return "Previewable";
    }
    case "narratable": {
      return "Narratable";
    }
    case "generated": {
      return "Generated";
    }
    case "stale": {
      return "Stale";
    }
    case "failed": {
      return "Failed";
    }
  }
}

function sourceLifecycleDetail(state: SourceLifecycleState): string {
  switch (state) {
    case "imported": {
      return "Imported and waiting for extraction.";
    }
    case "extracting": {
      return "Extraction is running or waiting for a ready result.";
    }
    case "extracted": {
      return "Source structure has been extracted.";
    }
    case "prepared": {
      return "Source is prepared for review.";
    }
    case "reviewable": {
      return "Source can be inspected and edited in Review.";
    }
    case "previewable": {
      return "Source can be auditioned in Preview.";
    }
    case "narratable": {
      return "Source has narratable scope ready for production audio.";
    }
    case "generated": {
      return "Generated audio exists for this source.";
    }
    case "stale": {
      return "Source metadata is ready, but extracted content is missing.";
    }
    case "failed": {
      return "Extraction failed and needs attention.";
    }
  }
}

function extractionStateLabel(state: SourceLifecycleState, rawStatus: string): string {
  if (state === "failed") {
    return "Extraction failed";
  }
  if (state === "imported" || state === "extracting") {
    return "Extraction pending";
  }
  if (state === "stale") {
    return "Extraction stale";
  }
  return `Extraction ${rawStatus}`;
}

function sourceTypeLabel(type: SourceLifecycleType): string {
  switch (type) {
    case "book": {
      return "Book";
    }
    case "document": {
      return "Document";
    }
    case "website": {
      return "Website";
    }
    case "pdf": {
      return "PDF";
    }
    case "epub": {
      return "EPUB";
    }
    case "docx": {
      return "DOCX";
    }
    case "markdown": {
      return "Markdown";
    }
    case "prepared": {
      return "Prepared source";
    }
    case "text": {
      return "Pasted text";
    }
    default: {
      return "Source";
    }
  }
}

function narratableScopeLabel(count: number, noun: "block" | "scope"): string {
  const label = noun === "block" ? "narratable block" : "narratable scope";
  return `${formatLocaleNumber(count)} ${label}${count === 1 ? "" : "s"}`;
}

function hasSourcePolicyPin(source: BookSource | PreparedSource): boolean {
  return (
    Boolean(source.sourceSpeechPolicyProfile) ||
    Object.keys(source.sourceSpeechPolicyOverrides ?? {}).length > 0
  );
}

function sourceAppliesToCopy(type: SourceLifecycleType, title: string): string {
  return `Applies to this ${sourceTypeLabel(type).toLowerCase()} source: ${title}.`;
}

function generatedSourceIdSet(jobs: VoiceJob[]): Set<string> {
  const ids = new Set<string>();
  for (const job of jobs) {
    if (job.status !== "completed") {
      continue;
    }
    if (job.preparedSourceId) {
      ids.add(`prepared:${job.preparedSourceId}`);
    }
    if (job.bookSourceId) {
      ids.add(`book:${job.bookSourceId}`);
    }
  }
  return ids;
}
