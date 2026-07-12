import {
  generatedAudioStateLabel,
  type SourceLifecycleDescriptor,
  type SourceLifecycleEnvelope,
  type SourceLifecycleTone,
  sourceLifecycleDescriptor,
  sourcePolicyScopeLabel,
} from "../source-lifecycle/sourceLifecycle";

export interface HeaderLifecycleMetadataItem {
  label: string;
  value: string;
}

export interface HeaderLifecycleFact {
  label: string;
  value: string;
}

export interface HeaderLifecycleSentenceModel {
  detailFacts: HeaderLifecycleFact[];
  primaryDetail: string;
  primaryLabel: string | null;
  primaryTone: SourceLifecycleTone;
  visibleSummary: string;
}

export interface HeaderLifecycleSentenceInput {
  metadata: readonly HeaderLifecycleMetadataItem[];
  sourceLifecycle?: SourceLifecycleEnvelope | null;
  sourceLifecycleDescriptorOverride?: SourceLifecycleDescriptor | null;
  sourceLifecycleGeneratedAudioLabel?: string | null;
  stateLabel?: string | null;
  surfaceName: string;
}

export function buildHeaderLifecycleSentence({
  metadata,
  sourceLifecycle = null,
  sourceLifecycleDescriptorOverride = null,
  sourceLifecycleGeneratedAudioLabel = null,
  stateLabel = null,
  surfaceName,
}: HeaderLifecycleSentenceInput): HeaderLifecycleSentenceModel {
  const descriptor = sourceLifecycle
    ? (sourceLifecycleDescriptorOverride ??
      sourceLifecycleDescriptor(sourceLifecycle.canonicalState))
    : null;
  const playbackState = normalizeHeaderStateLabel(stateLabel, surfaceName);
  const sourceState = descriptor ? normalizeHeaderStateLabel(descriptor.label, surfaceName) : null;
  const audioState = sourceLifecycle
    ? normalizeAudioStateLabel(
        cleanOptionalLabel(sourceLifecycleGeneratedAudioLabel) ??
          generatedAudioStateLabel(sourceLifecycle.generatedAudioState),
      )
    : null;
  const policyProfile = findMetadataValue(metadata, "policy");
  const voiceProfile = findMetadataValue(metadata, "voice");
  const policyState = sourceLifecycle ? sourcePolicyScopeLabel(sourceLifecycle.policyScope) : null;
  const primaryLabel = preferredPrimaryLabel(playbackState, sourceState, audioState);
  const primaryTone = descriptor?.tone ?? toneForStatus(primaryLabel);
  const detailFacts = uniqueFacts([
    sourceState ? { label: "Source state", value: sourceState } : null,
    audioState ? { label: "Audio state", value: audioState } : null,
    playbackState ? { label: "Playback state", value: playbackState } : null,
    policyState || policyProfile
      ? {
          label: "Policy state",
          value: [policyProfile, policyState].filter(Boolean).join(" · "),
        }
      : null,
    voiceProfile ? { label: "Voice state", value: voiceProfile } : null,
    ...metadata,
  ]);
  const visibleSummary = uniqueSummaryParts([
    primaryLabel,
    audioState,
    policyProfile ? `Policy ${policyProfile}` : policyState,
    voiceProfile ? `Voice ${voiceProfile}` : null,
  ]).join(" · ");

  return {
    detailFacts,
    primaryDetail: descriptor?.detail ?? visibleSummary,
    primaryLabel,
    primaryTone,
    visibleSummary,
  };
}

export function normalizeHeaderStateLabel(
  value: string | null | undefined,
  surfaceName: string,
): string | null {
  const label = cleanOptionalLabel(value);
  if (!label) {
    return null;
  }
  const normalized = label.toLowerCase();
  if (normalized === "ready" || normalized === "waiting") {
    return `${surfaceReadyNoun(surfaceName)} ${normalized}`;
  }
  if (normalized === "ready to create audio") {
    return "Source ready";
  }
  if (normalized === "audio stale") {
    return "Stale audio";
  }
  if (normalized === "no generated audio") {
    return "Audio missing";
  }
  return label;
}

export function normalizeAudioStateLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "ready" || normalized === "audio ready") {
    return "Audio ready";
  }
  if (normalized === "missing" || normalized === "no generated audio") {
    return "Audio missing";
  }
  if (normalized === "audio stale" || normalized === "stale") {
    return "Stale audio";
  }
  if (normalized === "degraded audio") {
    return "Degraded";
  }
  return value;
}

function preferredPrimaryLabel(
  playbackState: string | null,
  sourceState: string | null,
  audioState: string | null,
): string | null {
  const candidates = [playbackState, sourceState, audioState].filter(Boolean) as string[];
  const preferred = candidates.find((label) =>
    ["Playing", "Generating", "Stale audio", "Degraded", "Audio ready", "Source ready"].includes(
      label,
    ),
  );
  if (preferred) {
    return preferred;
  }
  return candidates.length > 0 ? candidates[0] : null;
}

function toneForStatus(label: string | null): SourceLifecycleTone {
  if (!label) {
    return "neutral";
  }
  const normalized = label.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("needs attention")) {
    return "danger";
  }
  if (normalized.includes("stale") || normalized.includes("degraded")) {
    return "warning";
  }
  if (normalized.includes("generating") || normalized.includes("preparing")) {
    return "info";
  }
  if (normalized.includes("ready") || normalized.includes("playing")) {
    return "success";
  }
  return "neutral";
}

function findMetadataValue(
  metadata: readonly HeaderLifecycleMetadataItem[],
  labelPart: string,
): string | null {
  const normalizedLabelPart = labelPart.toLowerCase();
  return (
    metadata.find((item) => item.label.toLowerCase().includes(normalizedLabelPart))?.value ?? null
  );
}

function surfaceReadyNoun(surfaceName: string): string {
  const normalized = surfaceName.toLowerCase();
  if (normalized.includes("preview")) {
    return "Preview";
  }
  if (normalized.includes("teleprompt")) {
    return "Teleprompt";
  }
  if (normalized.includes("workbench") || normalized.includes("workspace")) {
    return "Workspace";
  }
  return "Source";
}

function uniqueFacts(items: readonly (HeaderLifecycleFact | null)[]): HeaderLifecycleFact[] {
  const seen = new Set<string>();
  const result: HeaderLifecycleFact[] = [];
  for (const item of items) {
    if (!item) {
      continue;
    }
    const key = `${item.label.toLowerCase()}::${item.value.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function uniqueSummaryParts(items: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const label = cleanOptionalLabel(item);
    if (!label) {
      continue;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(label);
  }
  return result;
}

function cleanOptionalLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
