import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";

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
