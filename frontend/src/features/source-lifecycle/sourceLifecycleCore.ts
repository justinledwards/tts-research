import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";
import type {
  BookSource,
  PreparedSource,
  SourceReadiness,
  SourceReadinessState,
} from "../../types";

export const SOURCE_LIFECYCLE_STATES = [
  "new",
  "imported",
  "extracting",
  "extracted",
  "prepared",
  "reviewable",
  "previewable",
  "narratable",
  "generating",
  "audioReady",
  "stale",
  "failed",
  "archived",
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

export type SourceKind =
  | "book"
  | "document"
  | "draft"
  | "prepared"
  | "text"
  | "voice-clone"
  | "website";

export type SourceAdapterKind =
  | "book"
  | "docx"
  | "epub"
  | "html"
  | "image"
  | "markdown"
  | "pdf"
  | "text"
  | "unknown"
  | "url";

export type SourceExtractionState =
  | "archived"
  | "extracted"
  | "extracting"
  | "failed"
  | "imported"
  | "new";

export type SourceNarrationState =
  | "archived"
  | "audioReady"
  | "failed"
  | "generating"
  | "narratable"
  | "new"
  | "prepared"
  | "previewable"
  | "reviewable"
  | "stale";

export type SourcePolicyScope = "project" | "source";

export type SourceLifecycleSurface =
  | "Book Cinema"
  | "Cinema"
  | "Command Palette"
  | "Intake"
  | "Policy"
  | "Preview"
  | "Project Dashboard"
  | "Review"
  | "Settings"
  | "Teleprompt"
  | "Theatre"
  | "Workspace";

export type SourceLifecycleTone =
  | "accent"
  | "danger"
  | "info"
  | "neutral"
  | "pinned"
  | "success"
  | "warning";

export interface SourceLifecycleEnvelope {
  projectId: string;
  sourceId: string;
  sourceKind: SourceKind;
  adapterKind: SourceAdapterKind;
  sourceReadiness: SourceReadiness;
  title: string;
  language: string;
  selectedScope: string;
  extractionState: SourceExtractionState;
  narrationState: SourceNarrationState;
  policyScope: SourcePolicyScope;
  generatedAudioState: GeneratedAudioLifecycleState;
  lastOpenedSurface: SourceLifecycleSurface;
  canonicalState: SourceLifecycleState;
  activeBlockId?: string | null;
  disabledReason?: string;
  isActive?: boolean;
  narratableUnitCount?: number;
  updatedAt?: string;
  wordCount?: number;
}

export interface SourceFreshnessInput {
  audioUpdatedAt?: string | null;
  policyUpdatedAt?: string | null;
  runConfigUpdatedAt?: string | null;
  sourceUpdatedAt?: string | null;
}

export interface SourceSelectionSnapshot {
  activeBlockId?: string | null;
  generatedAudioState: GeneratedAudioLifecycleState;
  policyScope: SourcePolicyScope;
  selectedScope: string;
  sourceId: string | null;
}

export interface SourceSelectionContinuityFact {
  changed: boolean;
  label: string;
  value: string;
}

export function canonicalSourceLifecycleState({
  extractionState,
  generatedAudioState,
  narrationState,
}: Pick<
  SourceLifecycleEnvelope,
  "extractionState" | "generatedAudioState" | "narrationState"
>): SourceLifecycleState {
  if (
    extractionState === "archived" ||
    narrationState === "archived" ||
    generatedAudioState === "archived"
  ) {
    return "archived";
  }
  if (
    extractionState === "failed" ||
    narrationState === "failed" ||
    generatedAudioState === "failed"
  ) {
    return "failed";
  }
  if (generatedAudioState === "stale" || generatedAudioState === "degraded") {
    return "stale";
  }
  if (generatedAudioState === "ready" || narrationState === "audioReady") {
    return "audioReady";
  }
  if (
    generatedAudioState === "generating" ||
    generatedAudioState === "queued" ||
    narrationState === "generating"
  ) {
    return "generating";
  }
  if (narrationState === "narratable") {
    return "narratable";
  }
  if (narrationState === "previewable") {
    return "previewable";
  }
  if (narrationState === "reviewable") {
    return "reviewable";
  }
  if (narrationState === "prepared") {
    return "prepared";
  }
  if (extractionState === "extracted") {
    return "extracted";
  }
  if (extractionState === "extracting") {
    return "extracting";
  }
  if (extractionState === "imported") {
    return "imported";
  }
  return "new";
}

export function sourceReadinessIsReady(readiness: SourceReadiness | null | undefined): boolean {
  return sourceReadinessState(readiness) === "ready";
}

export function sourceReadinessState(
  readiness: SourceReadiness | null | undefined,
): SourceReadinessState {
  return readiness?.state ?? "ready";
}

export function sourceReadinessLabel(readiness: SourceReadiness | null | undefined): string {
  switch (sourceReadinessState(readiness)) {
    case "failed": {
      return "Source failed";
    }
    case "importing": {
      return "Importing";
    }
    case "needsMetadata": {
      return "Needs metadata";
    }
    case "noSource": {
      return "No source";
    }
    case "ready": {
      return "Source ready";
    }
    case "stale": {
      return "Source stale";
    }
    case "unsupported": {
      return "Unsupported";
    }
  }
}

export function sourceReadinessDetail(readiness: SourceReadiness | null | undefined): string {
  return readiness?.detail ?? "Source is ready for Review.";
}

export function sourceReadinessTone(
  readiness: SourceReadiness | null | undefined,
): SourceLifecycleTone {
  switch (sourceReadinessState(readiness)) {
    case "failed":
    case "unsupported": {
      return "danger";
    }
    case "importing": {
      return "info";
    }
    case "needsMetadata":
    case "stale": {
      return "warning";
    }
    case "ready": {
      return "success";
    }
    case "noSource": {
      return "neutral";
    }
  }
}

export function fallbackPreparedSourceReadiness(source: PreparedSource): SourceReadiness {
  if (source.sourceReadiness) {
    return source.sourceReadiness;
  }
  if (source.status === "failed") {
    return {
      confidence: "low",
      detail: source.error ?? "Source preparation failed.",
      failureStage: "structure",
      retryAction: "retryImport",
      sourceType: preparedSourceReadinessType(source),
      state: "failed",
      title: source.title ?? source.sourceName,
    };
  }
  return {
    confidence: "high",
    detail: "Source is ready for Review.",
    sourceType: preparedSourceReadinessType(source),
    state: "ready",
    title: source.title ?? source.sourceName,
  };
}

export function fallbackBookSourceReadiness(source: BookSource): SourceReadiness {
  if (source.sourceReadiness) {
    return source.sourceReadiness;
  }
  if (source.status === "failed") {
    return {
      confidence: "low",
      detail: source.error ?? "Source extraction failed.",
      failureStage: "extraction",
      retryAction: "retryImport",
      sourceType: source.kind === "html" ? "webpage" : "book",
      state: "failed",
      title: source.title ?? source.sourceFile,
    };
  }
  return {
    confidence: "high",
    detail: "Source is ready for Review.",
    sourceType: source.kind === "html" ? "webpage" : "book",
    state: "ready",
    title: source.title ?? source.sourceFile,
  };
}

export function hasSourcePolicyPinValues({
  profile,
  overrides = {},
}: {
  overrides?: object | null;
  profile?: string | null;
}): boolean {
  return Boolean(profile?.trim()) || Object.keys(overrides ?? {}).length > 0;
}

export function generatedAudioIsStale({
  audioUpdatedAt,
  policyUpdatedAt,
  runConfigUpdatedAt,
  sourceUpdatedAt,
}: SourceFreshnessInput): boolean {
  const audioTime = parseTime(audioUpdatedAt);
  if (audioTime === null) {
    return false;
  }
  return [sourceUpdatedAt, policyUpdatedAt, runConfigUpdatedAt].some((timestamp) => {
    const currentTime = parseTime(timestamp);
    return currentTime !== null && currentTime > audioTime;
  });
}

function parseTime(timestamp: string | null | undefined): number | null {
  if (!timestamp) {
    return null;
  }
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

function preparedSourceReadinessType(source: PreparedSource): string {
  if (source.kind === "url") {
    return "webpage";
  }
  if (source.kind === "text") {
    return "draft";
  }
  if (source.kind === "book") {
    return "book";
  }
  return "document";
}
