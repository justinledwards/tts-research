import type {
  BookScope,
  BookSource,
  CustomSpeechPolicyProfile,
  PreparedSource,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  VoiceJob,
  VoiceProfile,
} from "../../types";
import {
  hasSpeechPolicyOverrides,
  normalizeSpeechPolicyProfile,
  speechPolicyProfileLabel,
} from "../../speechPolicy";
import { speechPolicyOverrideCount } from "../policy/model";
import {
  sourceLifecycleModelsFromSources,
  sourceLifecycleSourceKey,
  type SourceCardModel,
} from "../source-lifecycle";
import {
  sourceReadinessDetail,
  sourceReadinessState,
} from "../source-lifecycle/sourceLifecycleCore";

export type AssetAvailability = "active" | "available";
export type AssetReadiness = "failed" | "needs-metadata" | "ready" | "stale" | "unavailable";

export interface AssetUsage {
  lastUsedAt: string | null;
  usageCount: number;
}

export interface SourceAssetModel extends SourceCardModel {
  assetKey: string;
  availability: AssetAvailability;
  availabilityLabel: "Active source" | "Available source";
  deleteConfirmation: string;
  extractionStateLabel: string;
  lastPreparedAt: string;
  provenance: string;
  readiness: AssetReadiness;
  readinessDetail: string;
  readinessLabel: string;
  reuseLabel: string;
  structureLabel: string;
  usage: AssetUsage;
}

export interface VoiceAssetModel {
  activeStateLabel: "Active voice" | "Available voice";
  assetKey: string;
  availability: AssetAvailability;
  deleteConfirmation: string | null;
  engineLabel: string;
  id: string;
  labels: string[];
  language: string;
  profilePath: string;
  providerLabel: string;
  readiness: AssetReadiness;
  readinessDetail: string;
  readinessLabel: string;
  referencePath: string;
  sourceLabel: string;
  title: string;
  type: "default" | "profile";
  updatedAt: string;
  usage: AssetUsage;
}

export interface SpeechPolicyAssetModel {
  customPresetCount: number;
  inheritedLabel: "Inherited" | "Overridden";
  machineDefaultLabel: string;
  projectDefaultLabel: string;
  requiresConfirmation: boolean;
  sessionOverrideCount: number;
  sourcePinCount: number;
  statusLabels: string[];
}

export function buildSourceAssetModels({
  activeBookSourceId,
  activePreparedSourceId,
  bookSources,
  jobs,
  preparedSources,
  projectId,
  selectedBookScope,
}: Readonly<{
  activeBookSourceId?: string | null;
  activePreparedSourceId?: string | null;
  bookSources: BookSource[];
  jobs: VoiceJob[];
  preparedSources: PreparedSource[];
  projectId?: string;
  selectedBookScope?: BookScope | null;
}>): SourceAssetModel[] {
  const sourceByKey = new Map<string, BookSource | PreparedSource>();
  for (const source of preparedSources) {
    sourceByKey.set(sourceLifecycleSourceKey("prepared", source.id), source);
  }
  for (const source of bookSources) {
    sourceByKey.set(sourceLifecycleSourceKey("book", source.id), source);
  }
  return sourceLifecycleModelsFromSources({
    activeBookSourceId,
    activePreparedSourceId,
    bookSources,
    jobs,
    preparedSources,
    projectId,
    selectedBookScope,
  }).map((model) => {
    const assetKey = sourceLifecycleSourceKey(model.owner, model.id);
    const source = sourceByKey.get(assetKey);
    const usage = usageForSource(jobs, model.owner, model.id);
    const readinessLabel = model.lifecycleState === "stale" ? "Stale" : model.lifecycleLabel;
    return {
      ...model,
      assetKey,
      availability: model.isActive ? "active" : "available",
      availabilityLabel: model.isActive ? "Active source" : "Available source",
      deleteConfirmation: `Delete ${model.title}? This removes the reusable source asset and its source-specific speech policy pin.`,
      extractionStateLabel: model.extractionState,
      lastPreparedAt: model.updatedAt,
      provenance: sourceProvenance(model, source),
      readiness: sourceAssetReadiness(model),
      readinessDetail: sourceReadinessDetail(model.envelope.sourceReadiness),
      readinessLabel,
      reuseLabel: usageLabel(usage, "run"),
      structureLabel: sourceStructureLabel(model, source),
      usage,
    };
  });
}

export function buildVoiceAssetModels({
  jobs,
  profiles,
  selectedProfileId,
}: Readonly<{
  jobs: VoiceJob[];
  profiles: VoiceProfile[];
  selectedProfileId: string;
}>): VoiceAssetModel[] {
  return [
    defaultVoiceAsset(jobs, selectedProfileId),
    ...profiles.map((profile) => voiceProfileAsset(profile, jobs, selectedProfileId)),
  ];
}

export function buildSpeechPolicyAssetModel({
  bookSources,
  customProfiles,
  preparedSources,
  sessionOverrides,
  speechPolicyProfile,
}: Readonly<{
  bookSources: BookSource[];
  customProfiles: CustomSpeechPolicyProfile[];
  preparedSources: PreparedSource[];
  sessionOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
}>): SpeechPolicyAssetModel {
  const sourcePinCount = [...bookSources, ...preparedSources].filter((source) =>
    sourceHasPolicyPin(source),
  ).length;
  const sessionOverrideCount = speechPolicyOverrideCount(sessionOverrides);
  const projectDefaultLabel = speechPolicyProfileLabel(
    normalizeSpeechPolicyProfile(speechPolicyProfile),
  );
  const statusLabels = [
    sourcePinCount > 0 ? "Source pins present" : "Project default",
    sessionOverrideCount > 0 ? "Session override" : "No session override",
    sourcePinCount > 0 ? "Requires confirmation" : "Inherited",
  ];
  return {
    customPresetCount: customProfiles.length,
    inheritedLabel: sourcePinCount > 0 || sessionOverrideCount > 0 ? "Overridden" : "Inherited",
    machineDefaultLabel: "Machine default is read-only runtime context",
    projectDefaultLabel,
    requiresConfirmation: sourcePinCount > 0,
    sessionOverrideCount,
    sourcePinCount,
    statusLabels,
  };
}

export function sourceHasPolicyPin(
  source: Pick<
    BookSource | PreparedSource,
    "sourceSpeechPolicyOverrides" | "sourceSpeechPolicyProfile"
  >,
): boolean {
  return (
    Boolean(source.sourceSpeechPolicyProfile?.trim()) ||
    hasSpeechPolicyOverrides(source.sourceSpeechPolicyOverrides ?? {})
  );
}

function defaultVoiceAsset(jobs: VoiceJob[], selectedProfileId: string): VoiceAssetModel {
  const usage = usageForDefaultVoice(jobs);
  return {
    activeStateLabel: selectedProfileId ? "Available voice" : "Active voice",
    assetKey: "voice:default",
    availability: selectedProfileId ? "available" : "active",
    deleteConfirmation: null,
    engineLabel: "Current TTS engine",
    id: "default",
    labels: ["Default voice", "Provider-backed"],
    language: "Project locale",
    profilePath: "Built-in provider voice",
    providerLabel: "Provider-backed",
    readiness: "ready",
    readinessDetail: "The default provider voice is available without a saved profile.",
    readinessLabel: "Ready",
    referencePath: "None",
    sourceLabel: "Synthetic default",
    title: "Default voice",
    type: "default",
    updatedAt: "",
    usage,
  };
}

function voiceProfileAsset(
  profile: VoiceProfile,
  jobs: VoiceJob[],
  selectedProfileId: string,
): VoiceAssetModel {
  const targetCount = Object.keys(profile.cloneTargets ?? {}).length;
  const artifactCount = Object.keys(profile.cloneArtifacts ?? {}).length;
  const labels = [
    profile.id === selectedProfileId ? "Active voice" : "Saved profile",
    targetCount > 0 || artifactCount > 0 ? "Generated clone" : "Provider-backed",
    profile.status === "ready" ? "Ready" : "Unavailable",
  ];
  return {
    activeStateLabel: profile.id === selectedProfileId ? "Active voice" : "Available voice",
    assetKey: `voice:${profile.id}`,
    availability: profile.id === selectedProfileId ? "active" : "available",
    deleteConfirmation: `Delete ${profile.name}? This removes the saved voice profile and clone target metadata.`,
    engineLabel: voiceEngineLabel(profile),
    id: profile.id,
    labels,
    language: profile.language || "Unknown language",
    profilePath: profile.referencePath || profile.referenceAudio || "Reference path unavailable",
    providerLabel: targetCount > 0 || artifactCount > 0 ? "Clone target" : "Provider-backed",
    readiness: voiceReadiness(profile),
    readinessDetail: voiceReadinessDetail(profile),
    readinessLabel: voiceReadinessLabel(profile),
    referencePath: profile.referencePath || profile.referenceAudio || "Unavailable",
    sourceLabel: profile.sourceFile || "Saved recording",
    title: profile.name,
    type: "profile",
    updatedAt: profile.updatedAt,
    usage: usageForVoiceProfile(jobs, profile.id),
  };
}

function sourceAssetReadiness(model: SourceCardModel): AssetReadiness {
  const readinessState = sourceReadinessState(model.envelope.sourceReadiness);
  if (model.lifecycleState === "failed" || readinessState === "failed") {
    return "failed";
  }
  if (model.lifecycleState === "stale" || readinessState === "stale") {
    return "stale";
  }
  if (!model.routeState.canReview) {
    return "needs-metadata";
  }
  return "ready";
}

function sourceProvenance(
  model: SourceCardModel,
  source: BookSource | PreparedSource | undefined,
): string {
  if (!source) {
    return model.typeLabel;
  }
  if (model.owner === "book") {
    return `${model.typeLabel} import · ${(source as BookSource).sourceFile}`;
  }
  const prepared = source as PreparedSource;
  return prepared.sourceUrl
    ? `URL import · ${prepared.sourceUrl}`
    : `${model.typeLabel} import · ${prepared.sourceName}`;
}

function sourceStructureLabel(
  model: SourceCardModel,
  source: BookSource | PreparedSource | undefined,
): string {
  if (!source) {
    return model.narratableScopeLabel;
  }
  if (model.owner === "book") {
    const book = source as BookSource;
    return `${book.chapterCount.toLocaleString()} chapters · ${book.pageCount.toLocaleString()} pages`;
  }
  const prepared = source as PreparedSource;
  return `${prepared.blockCount.toLocaleString()} blocks · ${prepared.segmentCount.toLocaleString()} segments`;
}

function usageForSource(
  jobs: VoiceJob[],
  owner: "book" | "prepared",
  sourceId: string,
): AssetUsage {
  return summarizeUsage(
    jobs.filter((job) =>
      owner === "book" ? job.bookSourceId === sourceId : job.preparedSourceId === sourceId,
    ),
  );
}

function usageForVoiceProfile(jobs: VoiceJob[], profileId: string): AssetUsage {
  return summarizeUsage(jobs.filter((job) => job.voiceProfileId === profileId));
}

function usageForDefaultVoice(jobs: VoiceJob[]): AssetUsage {
  return summarizeUsage(jobs.filter((job) => !job.voiceProfileId));
}

function summarizeUsage(jobs: VoiceJob[]): AssetUsage {
  let lastUsedAt: string | null = null;
  for (const job of jobs) {
    const timestamp = job.completedAt ?? job.updatedAt;
    if (timestamp && (!lastUsedAt || timestamp.localeCompare(lastUsedAt) > 0)) {
      lastUsedAt = timestamp;
    }
  }
  return {
    lastUsedAt,
    usageCount: jobs.length,
  };
}

function usageLabel(usage: AssetUsage, noun: string): string {
  if (usage.usageCount === 0) {
    return "Reusable · never used";
  }
  return `Reused ${usage.usageCount.toLocaleString()} ${noun}${usage.usageCount === 1 ? "" : "s"}`;
}

function voiceReadiness(profile: VoiceProfile): AssetReadiness {
  if (profile.status === "ready") {
    return "ready";
  }
  if (profile.status === "pending") {
    return "needs-metadata";
  }
  return "unavailable";
}

function voiceReadinessLabel(profile: VoiceProfile): string {
  if (profile.status === "ready") {
    return "Ready";
  }
  if (profile.status === "pending") {
    return "Preparing";
  }
  return "Unavailable";
}

function voiceReadinessDetail(profile: VoiceProfile): string {
  if (profile.error) {
    return profile.error;
  }
  if (profile.status === "ready") {
    return "Reference audio and saved profile metadata are ready.";
  }
  if (profile.status === "pending") {
    return "Profile preparation is still running.";
  }
  return "Profile is not available for narration.";
}

function voiceEngineLabel(profile: VoiceProfile): string {
  const targets = Object.values(profile.cloneTargets ?? {});
  const artifacts = Object.values(profile.cloneArtifacts ?? {});
  const targetEngine = targets.find((target) => target.engineId)?.engineId;
  const artifactEngine = artifacts.find((artifact) => artifact.engineId)?.engineId;
  return targetEngine ?? artifactEngine ?? "Provider voice";
}
