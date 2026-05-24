import type { BookScope, BookSource, PreparedSource, VoiceJob } from "../../types";
import { formatLocaleNumber } from "../i18n";
import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";
import { bookSourceLifecycleEnvelope, preparedSourceLifecycleEnvelope } from "./sourceEnvelope";
import {
  sourceAdapterLabel,
  sourceKindLabel,
  sourceLifecycleAriaLabel,
  sourceLifecycleDescriptor,
  sourceLifecycleLabel,
  sourceLifecycleOptionLabel,
  sourceLifecycleTypeLabel,
  type SourceAdapterKind,
  type SourceExtractionState,
  type SourceLifecycleEnvelope,
  type SourceLifecycleState,
  type SourceLifecycleSurface,
  type SourceLifecycleType,
} from "./sourceLifecycle";

export {
  bookSourceLifecycleEnvelope,
  draftSourceLifecycleEnvelope,
  preparedSourceLifecycleEnvelope,
} from "./sourceEnvelope";

export interface SourceLifecycleRouteState {
  canReview: boolean;
  canPreview: boolean;
  canCinema: boolean;
  reviewDisabledReason?: string;
  previewDisabledReason?: string;
  cinemaDisabledReason?: string;
}

export type SourceSelectorOwner = "book" | "draft" | "prepared";

export interface SourceLifecycleSelectorOption {
  badgeLabel: string;
  detail: string;
  envelope: SourceLifecycleEnvelope;
  label: string;
  owner: SourceSelectorOwner;
  optionLabel: string;
  sourceId: string;
  value: string;
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
  envelope: SourceLifecycleEnvelope;
  generatedAudioState: GeneratedAudioLifecycleState;
  selectedScope: string;
}

export function sourceLifecycleModelsFromSources({
  activeBookSourceId,
  activePreparedSourceId,
  bookSources,
  jobs = [],
  preparedSources,
  projectId,
  selectedBookScope,
}: {
  activeBookSourceId?: string | null;
  activePreparedSourceId?: string | null;
  bookSources: BookSource[];
  jobs?: VoiceJob[];
  preparedSources: PreparedSource[];
  projectId?: string;
  selectedBookScope?: BookScope | null;
}): SourceCardModel[] {
  const models: SourceCardModel[] = [
    ...preparedSources.map((source) =>
      preparedSourceLifecycleModel(source, {
        isActive: source.id === activePreparedSourceId,
        job: latestJobForSource(jobs, { owner: "prepared", sourceId: source.id }),
        lastOpenedSurface: "Project Dashboard",
        projectId,
      }),
    ),
    ...bookSources.map((source) =>
      bookSourceLifecycleModel(source, {
        isActive: source.id === activeBookSourceId,
        job: latestJobForSource(jobs, { owner: "book", sourceId: source.id }),
        lastOpenedSurface: "Project Dashboard",
        projectId,
        selectedScope: source.id === activeBookSourceId ? selectedBookScope : null,
      }),
    ),
  ];
  // Stable project source ordering is easier to audit when newest sources are first.
  // eslint-disable-next-line unicorn/no-array-sort
  return [...models].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function sourceLifecycleEnvelopesFromSources({
  activeBookSourceId,
  activePreparedSourceId,
  bookSources,
  jobs = [],
  preparedSources,
  projectId,
  selectedBookScope,
  surface = "Workspace",
}: {
  activeBookSourceId?: string | null;
  activePreparedSourceId?: string | null;
  bookSources: BookSource[];
  jobs?: VoiceJob[];
  preparedSources: PreparedSource[];
  projectId?: string;
  selectedBookScope?: BookScope | null;
  surface?: SourceLifecycleSurface;
}): SourceLifecycleEnvelope[] {
  return sourceLifecycleModelsFromSources({
    activeBookSourceId,
    activePreparedSourceId,
    bookSources,
    jobs,
    preparedSources,
    projectId,
    selectedBookScope,
  }).map((model) => ({
    ...model.envelope,
    lastOpenedSurface: surface,
  }));
}

export function bookSourceLifecycleModel(
  source: BookSource,
  options: {
    generated?: boolean;
    isActive?: boolean;
    job?: VoiceJob | null;
    lastOpenedSurface?: SourceLifecycleSurface;
    projectId?: string;
    selectedScope?: BookScope | null;
  } = {},
): SourceCardModel {
  const envelope = bookSourceLifecycleEnvelope(source, options);
  const routeState = readyRouteState(source.status === "ready", source.error, "Book source");
  const narratableScopeCount = envelope.narratableUnitCount ?? 0;
  return sourceCardModelFromEnvelope(envelope, {
    appliesToCopy: sourceAppliesToCopy(envelope),
    enabledDisabledReason: routeState.canReview
      ? "Ready for Review, Preview, and Cinema."
      : (routeState.reviewDisabledReason ?? "Book source is unavailable."),
    expectedStateTransition: routeState.canReview
      ? "Reopens this book in Review using its selected narratable scope."
      : "Book extraction must complete before Review, Preview, or Cinema routes are available.",
    narratableScopeCount,
    narratableScopeLabel: narratableScopeLabel(narratableScopeCount, "scope"),
    owner: "book",
    routeState,
    type: bookSourceLifecycleType(source.kind),
    updatedAt: source.updatedAt,
  });
}

export function preparedSourceLifecycleModel(
  source: PreparedSource,
  options: {
    generated?: boolean;
    isActive?: boolean;
    job?: VoiceJob | null;
    lastOpenedSurface?: SourceLifecycleSurface;
    projectId?: string;
  } = {},
): SourceCardModel {
  const envelope = preparedSourceLifecycleEnvelope(source, options);
  const routeState = readyRouteState(source.status === "ready", source.error, "Prepared source");
  const narratableScopeCount = source.summary.spokenBlockCount;
  return sourceCardModelFromEnvelope(envelope, {
    appliesToCopy: sourceAppliesToCopy(envelope),
    enabledDisabledReason: routeState.canReview
      ? "Ready for Review, Preview, and Cinema."
      : (routeState.reviewDisabledReason ?? "Prepared source is unavailable."),
    expectedStateTransition: routeState.canReview
      ? "Reopens this source in Review without creating a duplicate import."
      : "Source must finish extraction before Review, Preview, or Cinema routes are available.",
    narratableScopeCount,
    narratableScopeLabel: narratableScopeLabel(narratableScopeCount, "block"),
    owner: "prepared",
    routeState,
    type: preparedSourceLifecycleType(source),
    updatedAt: source.updatedAt,
  });
}

export function sourceSelectorOption(
  envelope: SourceLifecycleEnvelope,
  owner: SourceSelectorOwner,
): SourceLifecycleSelectorOption {
  return {
    badgeLabel: sourceLifecycleLabel(envelope.canonicalState),
    detail: `${sourceAdapterLabel(envelope.adapterKind)} · ${envelope.selectedScope} · ${
      envelope.wordCount === undefined
        ? "size unknown"
        : `${formatLocaleNumber(envelope.wordCount)} words`
    }`,
    envelope,
    label: `${sourceKindLabel(envelope.sourceKind)} · ${envelope.title}`,
    optionLabel: sourceLifecycleOptionLabel(envelope),
    owner,
    sourceId: envelope.sourceId,
    value: sourceLifecycleSourceKey(owner, envelope.sourceId),
  };
}

export function sourceLifecycleSourceKey(owner: SourceSelectorOwner, sourceId: string): string {
  return `${owner}:${sourceId}`;
}

export function latestJobForSource(
  jobs: VoiceJob[],
  source: { owner: "book" | "prepared"; sourceId: string },
): VoiceJob | null {
  const matchingJobs = jobs.filter((job) =>
    source.owner === "book"
      ? job.bookSourceId === source.sourceId
      : job.preparedSourceId === source.sourceId,
  );
  let latestJob: VoiceJob | null = null;
  for (const job of matchingJobs) {
    if (!latestJob || job.updatedAt.localeCompare(latestJob.updatedAt) > 0) {
      latestJob = job;
    }
  }
  return latestJob;
}

function sourceCardModelFromEnvelope(
  envelope: SourceLifecycleEnvelope,
  model: {
    appliesToCopy: string;
    enabledDisabledReason: string;
    expectedStateTransition: string;
    narratableScopeCount: number;
    narratableScopeLabel: string;
    owner: "book" | "prepared";
    routeState: SourceLifecycleRouteState;
    type: SourceLifecycleType;
    updatedAt: string;
  },
): SourceCardModel {
  const descriptor = sourceLifecycleDescriptor(envelope.canonicalState);
  return {
    accessibleLabel: sourceLifecycleAriaLabel(envelope),
    activeStateLabel: envelope.isActive ? "Active source" : "Available source",
    appliesToCopy: model.appliesToCopy,
    enabledDisabledReason: model.enabledDisabledReason,
    envelope,
    expectedStateTransition: model.expectedStateTransition,
    extractionState: extractionStateLabel(envelope.extractionState),
    generatedAudioState: envelope.generatedAudioState,
    hasPolicyPin: envelope.policyScope === "source",
    id: envelope.sourceId,
    isActive: Boolean(envelope.isActive),
    lifecycleDetail: descriptor.detail,
    lifecycleLabel: descriptor.label,
    lifecycleState: envelope.canonicalState,
    narratableScopeCount: model.narratableScopeCount,
    narratableScopeLabel: model.narratableScopeLabel,
    owner: model.owner,
    policyPinLabel: envelope.policyScope === "source" ? "Policy pinned" : "Project policy",
    routeState: model.routeState,
    selectedScope: envelope.selectedScope,
    title: envelope.title,
    type: model.type,
    typeLabel: sourceLifecycleTypeLabel(model.type),
    updatedAt: model.updatedAt,
    visibleLabel: envelope.title,
  };
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
  const adapterKind = preparedSourceAdapterKind(source);
  if (adapterKind === "html") {
    return "website";
  }
  return adapterKind === "unknown" || adapterKind === "url" || adapterKind === "image"
    ? "document"
    : adapterKind;
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

function extractionStateLabel(state: SourceExtractionState): string {
  if (state === "failed") {
    return "Extraction failed";
  }
  if (state === "new") {
    return "Not imported";
  }
  if (state === "imported" || state === "extracting") {
    return "Extraction pending";
  }
  if (state === "archived") {
    return "Extraction archived";
  }
  return "Extraction ready";
}

function narratableScopeLabel(count: number, noun: "block" | "scope"): string {
  const label = noun === "block" ? "narratable block" : "narratable scope";
  return `${formatLocaleNumber(count)} ${label}${count === 1 ? "" : "s"}`;
}

function sourceAppliesToCopy(envelope: SourceLifecycleEnvelope): string {
  return `Applies to this ${sourceKindLabel(envelope.sourceKind).toLowerCase()} source: ${
    envelope.title
  }.`;
}
