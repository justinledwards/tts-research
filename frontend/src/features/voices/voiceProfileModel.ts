import type {
  ResearchModuleDiagnostics,
  TTSEngineDiagnostics,
  VoiceProfile,
  VoiceProfileCandidate,
  VoiceProfileSource,
  VoiceProfileTarget,
} from "../../types";
import {
  providerCapabilityGate,
  resolveProviderRuntimeCapabilities,
} from "../provider-capabilities";

export interface VoiceProfileSummary {
  artifactCount: number;
  candidateSource: string;
  id: string;
  language: string;
  name: string;
  readiness: VoiceReadiness;
  sourceDurationMs: number;
  status: string;
  targetCount: number;
  updatedAt: string;
}

export interface VoiceTargetSummary {
  engineLabel: string;
  buildCapabilityReason?: string;
  cancelCapabilityReason?: string;
  id: string;
  moduleId: string | null;
  moduleLabel: string;
  profileId: string;
  profileName: string;
  readiness: VoiceReadiness;
  selected: boolean;
  status: string;
  targetLabel: string;
  updatedAt: string;
}

export interface VoiceCandidateSummary {
  id: string;
  name: string;
  readiness: VoiceReadiness;
  score: number;
  status: string;
  suitability: string;
  warnings: string[];
}

export interface VoiceSourceSummary {
  candidateCount: number;
  fileName: string;
  id: string;
  progress: string;
  status: string;
}

export type VoiceReadiness = "attention" | "pending" | "ready" | "warning";

export interface VoiceProfileDashboardModel {
  candidates: VoiceCandidateSummary[];
  profiles: VoiceProfileSummary[];
  selectedProfile: VoiceProfile | null;
  source: VoiceSourceSummary | null;
  targets: VoiceTargetSummary[];
  totals: {
    candidates: number;
    profiles: number;
    readyProfiles: number;
    readyTargets: number;
    targets: number;
  };
}

export function buildVoiceProfileDashboardModel({
  engines,
  modules,
  profiles,
  selectedProfileId,
  source,
}: Readonly<{
  engines: TTSEngineDiagnostics[];
  modules: ResearchModuleDiagnostics[];
  profiles: VoiceProfile[];
  selectedProfileId: string;
  source: VoiceProfileSource | null;
}>): VoiceProfileDashboardModel {
  const selectedProfile = resolveSelectedProfile(profiles, selectedProfileId);
  const candidates = (source?.candidates ?? []).map((candidate) => mapCandidateSummary(candidate));
  const targets = profiles.flatMap((profile) => mapProfileTargets(profile, modules, engines));
  const profileSummaries = profiles.map((profile) => mapProfileSummary(profile));
  return {
    candidates,
    profiles: profileSummaries,
    selectedProfile,
    source: source
      ? {
          candidateCount: source.candidates.length,
          fileName: source.sourceFile,
          id: source.id,
          progress: source.progressMessage,
          status: source.status,
        }
      : null,
    targets,
    totals: {
      candidates: candidates.length,
      profiles: profiles.length,
      readyProfiles: profileSummaries.filter((profile) => profile.readiness === "ready").length,
      readyTargets: targets.filter((target) => target.readiness === "ready").length,
      targets: targets.length,
    },
  };
}

function resolveSelectedProfile(profiles: VoiceProfile[], selectedProfileId: string) {
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  if (selectedProfile) {
    return selectedProfile;
  }
  if (profiles.length > 0) {
    return profiles[0];
  }
  return null;
}

export function voiceReadinessTone(readiness: VoiceReadiness) {
  if (readiness === "ready") {
    return "success" as const;
  }
  if (readiness === "attention") {
    return "danger" as const;
  }
  if (readiness === "warning") {
    return "warning" as const;
  }
  return "neutral" as const;
}

export function voiceReadinessLabel(readiness: VoiceReadiness): string {
  const labels: Record<VoiceReadiness, string> = {
    attention: "Needs attention",
    pending: "Pending",
    ready: "Ready",
    warning: "Check setup",
  };
  return labels[readiness];
}

function mapProfileSummary(profile: VoiceProfile): VoiceProfileSummary {
  const targets = Object.values(profile.cloneTargets ?? {});
  const artifacts = Object.values(profile.cloneArtifacts ?? {});
  return {
    artifactCount: artifacts.length,
    candidateSource: profile.speakerName ?? profile.sourceFile,
    id: profile.id,
    language: profile.language || "unknown",
    name: profile.name,
    readiness: resolveProfileReadiness(profile, targets),
    sourceDurationMs: profile.referenceDurationMs ?? profile.durationMs,
    status: profile.status,
    targetCount: targets.length,
    updatedAt: profile.updatedAt,
  };
}

function mapProfileTargets(
  profile: VoiceProfile,
  modules: ResearchModuleDiagnostics[],
  engines: TTSEngineDiagnostics[],
): VoiceTargetSummary[] {
  return Object.values(profile.cloneTargets ?? {}).map((target) =>
    mapTargetSummary(profile, target, modules, engines),
  );
}

function mapTargetSummary(
  profile: VoiceProfile,
  target: VoiceProfileTarget,
  modules: ResearchModuleDiagnostics[],
  engines: TTSEngineDiagnostics[],
): VoiceTargetSummary {
  const moduleLabel =
    modules.find((module) => module.id === target.moduleId)?.label ?? target.moduleId ?? "Runtime";
  const engineLabel =
    engines.find((engine) => engine.id === target.engineId)?.label ?? target.engineId ?? "Engine";
  const runtime = resolveProviderRuntimeCapabilities(target.engineId ?? "", engines);
  const buildCapabilityGate = providerCapabilityGate(runtime, "voiceCloning");
  const cancelCapabilityGate = providerCapabilityGate(runtime, "cancelJob");
  return {
    buildCapabilityReason: buildCapabilityGate.reason,
    cancelCapabilityReason: cancelCapabilityGate.reason,
    engineLabel,
    id: target.id,
    moduleId: target.moduleId ?? null,
    moduleLabel,
    profileId: profile.id,
    profileName: profile.name,
    readiness: resolveTargetReadiness(target),
    selected: target.selected,
    status: target.status,
    targetLabel: target.label ?? target.id,
    updatedAt: target.updatedAt,
  };
}

function mapCandidateSummary(candidate: VoiceProfileCandidate): VoiceCandidateSummary {
  return {
    id: candidate.id,
    name: candidate.suggestedName,
    readiness:
      candidate.status === "ready" && candidate.suitability !== "rejected" ? "ready" : "attention",
    score: candidate.score,
    status: candidate.status,
    suitability: candidate.suitability ?? "pending",
    warnings: candidate.warnings ?? [],
  };
}

function resolveProfileReadiness(
  profile: VoiceProfile,
  targets: VoiceProfileTarget[],
): VoiceReadiness {
  if (profile.status === "error") {
    return "attention";
  }
  if (profile.status === "pending") {
    return "pending";
  }
  if (targets.some((target) => target.status === "failed")) {
    return "warning";
  }
  return "ready";
}

function resolveTargetReadiness(target: VoiceProfileTarget): VoiceReadiness {
  if (target.status === "ready") {
    return "ready";
  }
  if (target.status === "failed" || target.status === "cancelled") {
    return "attention";
  }
  if (
    target.status === "queued" ||
    target.status === "building" ||
    target.status === "validating"
  ) {
    return "pending";
  }
  return "warning";
}
