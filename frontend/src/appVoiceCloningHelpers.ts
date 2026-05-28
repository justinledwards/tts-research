import { formatElapsed, formatRelativeTime, shortIdentifier } from "./appHelpers";
import {
  voiceProfileTargetForEngine,
  isVoiceProfileTargetReadyForEngine,
  voiceProfileTargetReadinessText,
} from "./profileTargets";
import type { StageStatus, VoiceProfile, VoiceProfileSource } from "./types";

export type ActivityStatus = "idle" | "running" | "attention" | "complete" | "cancelled";

export interface ActivityStageSummary {
  detail?: string;
  label: string;
  status: StageStatus;
}

export interface VoiceCloningActivitySummary {
  activeProfile: VoiceProfile | null;
  actionLabel: string;
  candidateDetail: string;
  detail: string;
  elapsed: string;
  eta: string;
  lastUpdate: string;
  message: string;
  sourceDetail: string;
  stages: ActivityStageSummary[];
  status: ActivityStatus;
  statusLabel: string;
}

export function isVoiceProfileSourceActive(source: VoiceProfileSource | null): boolean {
  return Boolean(
    source &&
      source.status !== "ready" &&
      source.status !== "failed" &&
      source.status !== "cancelled",
  );
}

function scopedProfileTargetIds(engineId: string): string[] | null {
  const targetId = voiceProfileTargetForEngine(engineId);
  return targetId ? [targetId] : null;
}

function targetIdMatchesScope(targetId: string, targetIds?: readonly string[] | null): boolean {
  return !targetIds || targetIds.length === 0 || targetIds.includes(targetId);
}

function scopedCloneTargets(profile: VoiceProfile, targetIds?: readonly string[] | null) {
  return Object.entries(profile.cloneTargets ?? {})
    .filter(([targetId]) => targetIdMatchesScope(targetId, targetIds))
    .map(([, target]) => target);
}

function scopedCloneArtifacts(profile: VoiceProfile, targetIds?: readonly string[] | null) {
  return Object.entries(profile.cloneArtifacts ?? {})
    .filter(([targetId]) => targetIdMatchesScope(targetId, targetIds))
    .map(([, artifact]) => artifact);
}

export function profileHasActiveTarget(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  return scopedCloneTargets(profile, targetIds).some((target) =>
    ["queued", "building", "validating"].includes(target.status),
  );
}

export function profileHasTargetAttention(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  return (
    targets.some(
      (target) => target.status === "failed" || target.validation?.status === "failed",
    ) || artifacts.some((artifact) => artifact.status === "failed")
  );
}

export function profileHasBlockingTargetAttention(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  return (
    targets.some((target) => target.status === "failed") ||
    artifacts.some((artifact) => artifact.status === "failed")
  );
}

export function profileHasTargetCancelled(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  return (
    targets.some(
      (target) => target.status === "cancelled" || target.validation?.status === "cancelled",
    ) || artifacts.some((artifact) => artifact.status === "cancelled")
  );
}

export function profileHasReadyCloneTarget(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  return (
    targets.some((target) => target.status === "ready") ||
    artifacts.some((artifact) => artifact.status === "ready")
  );
}

function resolveActiveCloneProfile(
  selectedProfile: VoiceProfile | null,
  profiles: VoiceProfile[],
  engineId: string,
): VoiceProfile | null {
  if (selectedProfile) {
    return selectedProfile;
  }
  const targetIds = scopedProfileTargetIds(engineId);
  return (
    profiles.find((profile) => profileHasActiveTarget(profile, targetIds)) ??
    profiles.find((profile) => isVoiceProfileTargetReadyForEngine(profile, engineId)) ??
    profiles.find((profile) => profileHasActiveTarget(profile)) ??
    profiles.find((profile) => profileHasTargetAttention(profile, targetIds)) ??
    profiles.find((profile) => profileHasTargetAttention(profile)) ??
    null
  );
}

function sourceStageStatus(source: VoiceProfileSource | null, stageName: string): StageStatus {
  return source?.stages.find((stage) => stage.name === stageName)?.status ?? "waiting";
}

function resolveAnalyzeStageStatus(source: VoiceProfileSource | null): StageStatus {
  if (!source) {
    return "waiting";
  }
  if (source.status === "cancelled") {
    return "failed";
  }
  if (source.status === "failed") {
    return sourceStageStatus(source, "normalize") === "failed" ||
      sourceStageStatus(source, "denoise") === "failed"
      ? "failed"
      : "done";
  }
  if (source.status === "queued" || source.status === "normalizing") {
    return "running";
  }
  return "done";
}

function resolveDetectStageStatus(source: VoiceProfileSource | null): StageStatus {
  if (!source) {
    return "waiting";
  }
  if (source.status === "cancelled") {
    return "failed";
  }
  if (source.status === "failed") {
    return sourceStageStatus(source, "analyze") === "failed" ||
      sourceStageStatus(source, "score") === "failed"
      ? "failed"
      : "waiting";
  }
  if (source.status === "analyzing" || source.status === "scoring") {
    return "running";
  }
  return source.status === "ready" ? "done" : "waiting";
}

function resolveBuildStageStatus(
  profile: VoiceProfile | null,
  buildingArtifactKey: string | null,
  targetIds?: readonly string[] | null,
  engineId?: string,
): StageStatus {
  if (!profile) {
    return buildingArtifactKey ? "running" : "waiting";
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  if (
    buildingArtifactMatchesScope(profile.id, buildingArtifactKey, targetIds) ||
    targets.some((target) => ["queued", "building"].includes(target.status)) ||
    artifacts.some((artifact) => artifact.status === "building")
  ) {
    return "running";
  }
  const engineTargetReady = engineId
    ? isVoiceProfileTargetReadyForEngine(profile, engineId)
    : false;
  if (profileHasReadyCloneTarget(profile, targetIds) || engineTargetReady) {
    return "done";
  }
  if (
    targets.some((target) => target.status === "failed") ||
    artifacts.some((artifact) => artifact.status === "failed")
  ) {
    return "failed";
  }
  return profileHasTargetCancelled(profile, targetIds) ? "failed" : "waiting";
}

function buildingArtifactMatchesScope(
  profileId: string,
  buildingArtifactKey: string | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!buildingArtifactKey?.startsWith(`${profileId}:`)) {
    return false;
  }
  if (!targetIds || targetIds.length === 0) {
    return true;
  }
  return targetIds.some((targetId) => buildingArtifactKey === `${profileId}:${targetId}`);
}

function resolveValidateStageStatus(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
  engineId?: string,
): StageStatus {
  if (!profile) {
    return "waiting";
  }
  const targets = scopedCloneTargets(profile, targetIds);
  if (
    targets.some((target) => target.status === "ready") ||
    (engineId ? isVoiceProfileTargetReadyForEngine(profile, engineId) : false)
  ) {
    return "done";
  }
  if (targets.some((target) => target.validation?.status === "failed")) {
    return "failed";
  }
  if (targets.some((target) => target.validation?.status === "cancelled")) {
    return "failed";
  }
  if (targets.some((target) => target.status === "validating")) {
    return "running";
  }
  if (targets.some((target) => target.validation?.status === "ready")) {
    return "done";
  }
  return "waiting";
}

export function voiceCloningProgressRatio(stages: ActivityStageSummary[]): number {
  if (stages.length === 0) {
    return 0;
  }
  const doneCount = stages.filter((stage) => stage.status === "done").length;
  const runningIndex = stages.findIndex((stage) => stage.status === "running");
  const partial = runningIndex === -1 ? 0 : 0.55;
  return Math.min(1, (doneCount + partial) / stages.length);
}

function latestTimestamp(...timestamps: (string | undefined)[]): string | undefined {
  let latest: string | undefined;
  for (const timestamp of timestamps) {
    if (typeof timestamp !== "string" || timestamp.trim().length === 0) {
      continue;
    }
    if (!latest || Date.parse(timestamp) > Date.parse(latest)) {
      latest = timestamp;
    }
  }
  return latest;
}

function latestProfileActivityTimestamp(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): string | undefined {
  if (!profile) {
    return undefined;
  }
  const targetTimes = scopedCloneTargets(profile, targetIds).flatMap((target) => [
    target.updatedAt,
    target.validation?.measuredAt,
  ]);
  const artifactTimes = scopedCloneArtifacts(profile, targetIds).map(
    (artifact) => artifact.updatedAt,
  );
  return latestTimestamp(profile.updatedAt, ...targetTimes, ...artifactTimes);
}

export function resolveVoiceCloneCompletionReference(
  activeProfile: VoiceProfile | null,
  profileSource: VoiceProfileSource | null,
  targetIds: readonly string[] | null | undefined,
): string | undefined {
  const targets = activeProfile ? scopedCloneTargets(activeProfile, targetIds) : [];
  const measuredAt = latestTimestamp(...targets.map((target) => target.validation?.measuredAt));
  if (measuredAt) {
    return measuredAt;
  }
  const updatedAt = latestTimestamp(...targets.map((target) => target.updatedAt));
  if (updatedAt) {
    return updatedAt;
  }
  return latestTimestamp(
    activeProfile?.updatedAt,
    profileSource?.updatedAt,
    profileSource?.createdAt,
  );
}

export function resolveVoiceCloningActivityNow({
  now,
  status,
  completionReference,
}: Readonly<{
  completionReference: string | undefined | null;
  now: number;
  status: ActivityStatus;
}>): number {
  if (status === "running" || status === "attention") {
    return now;
  }
  if (!completionReference) {
    return now;
  }
  const parsed = Date.parse(completionReference);
  if (!Number.isFinite(parsed)) {
    return now;
  }
  return parsed;
}

function sourceActivityMessage(source: VoiceProfileSource | null): string {
  if (!source) {
    return "No source analysis is running.";
  }
  if (source.progressMessage.trim().length > 0) {
    return source.progressMessage;
  }
  switch (source.status) {
    case "queued": {
      return "Queued for source analysis.";
    }
    case "normalizing": {
      return "Preparing source audio.";
    }
    case "analyzing": {
      return "Detecting and separating speaker segments.";
    }
    case "scoring": {
      return "Scoring candidate voice references.";
    }
    case "ready": {
      return "Voice candidates are ready for review.";
    }
    case "failed": {
      return "Source analysis needs attention.";
    }
    case "cancelled": {
      return "Source analysis was cancelled.";
    }
    default: {
      return "Voice cloning is waiting.";
    }
  }
}

function resolveVoiceCloneActionLabel(status: ActivityStatus): string {
  switch (status) {
    case "attention": {
      return "Review Issue";
    }
    case "cancelled": {
      return "Review Cancelled";
    }
    case "running": {
      return "View Progress";
    }
    case "complete": {
      return "View Profile";
    }
    default: {
      return "Create Clone";
    }
  }
}

function resolveVoiceCloneStages(
  profileSource: VoiceProfileSource | null,
  activeProfile: VoiceProfile | null,
  buildingArtifactKey: string | null,
  targetIds: readonly string[] | null,
  engineId: string,
): ActivityStageSummary[] {
  const detectDetail =
    profileSource?.status === "scoring" ? "Scoring candidate references" : "Find speaker turns";
  return [
    {
      detail: profileSource?.progressDetail ?? "Prepare analysis-ready audio",
      label: "Analyze Source",
      status: resolveAnalyzeStageStatus(profileSource),
    },
    {
      detail: detectDetail,
      label: "Detect Speakers",
      status: resolveDetectStageStatus(profileSource),
    },
    {
      detail: activeProfile ? "Prepare selected clone targets" : "Waiting for profile",
      label: "Build Clone",
      status: resolveBuildStageStatus(activeProfile, buildingArtifactKey, targetIds, engineId),
    },
    {
      detail: activeProfile ? "Measure likeness and readiness" : "Waiting for target",
      label: "Validate Voice",
      status: resolveValidateStageStatus(activeProfile, targetIds, engineId),
    },
  ];
}

function resolveVoiceCloneActivityStatus({
  activeProfile,
  attention,
  cancelled,
  sourceActive,
  targetActive,
  profileSource,
  targetReady,
}: Readonly<{
  activeProfile: VoiceProfile | null;
  attention: boolean;
  cancelled: boolean;
  sourceActive: boolean;
  targetActive: boolean;
  profileSource: VoiceProfileSource | null;
  targetReady: boolean;
}>): ActivityStatus {
  if (attention) {
    return "attention";
  }
  if (cancelled) {
    return "cancelled";
  }
  if (sourceActive || targetActive) {
    return "running";
  }
  if (activeProfile && (profileSource?.status === "ready" || targetReady)) {
    return "complete";
  }
  return "idle";
}

function resolveVoiceCloneStatusLabel({
  profileSource,
  sourceActive,
  status,
}: Readonly<{
  profileSource: VoiceProfileSource | null;
  sourceActive: boolean;
  status: ActivityStatus;
}>): string {
  if (status === "attention") {
    return "Attention Needed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  if (status === "running") {
    return sourceActive
      ? humanizeSourceStatus(profileSource?.status ?? "queued")
      : "Preparing Target";
  }
  if (status === "complete") {
    return "Ready";
  }
  return "Idle";
}

function voiceCloneSourceDetail(
  profileSource: VoiceProfileSource | null,
  activeProfile: VoiceProfile | null,
): string {
  if (profileSource) {
    return `${shortIdentifier(profileSource.id)} · ${profileSource.sourceFile}`;
  }
  if (activeProfile) {
    return `${shortIdentifier(activeProfile.id)} · ${activeProfile.name}`;
  }
  return "No source queued";
}

function voiceCloneDetail(
  profileSource: VoiceProfileSource | null,
  activeProfile: VoiceProfile | null,
  engineId: string,
): string {
  if (profileSource?.progressDetail) {
    return profileSource.progressDetail;
  }
  if (activeProfile) {
    return voiceProfileTargetReadinessText(activeProfile, engineId);
  }
  return "Upload source media to begin.";
}

function voiceCloneEta(status: ActivityStatus): string {
  if (status === "running") {
    return "Polling every 3s";
  }
  if (status === "complete") {
    return "Complete";
  }
  if (status === "cancelled") {
    return "Stopped";
  }
  return "n/a";
}

function humanizeSourceStatus(status: string): string {
  switch (status) {
    case "queued": {
      return "Queued";
    }
    case "normalizing": {
      return "Normalizing";
    }
    case "analyzing": {
      return "Detecting Speakers";
    }
    case "scoring": {
      return "Scoring Candidates";
    }
    case "ready": {
      return "Ready";
    }
    case "failed": {
      return "Failed";
    }
    case "cancelled": {
      return "Cancelled";
    }
    default: {
      return "Working";
    }
  }
}

export function resolveVoiceCloningActivity({
  activeEngineId,
  buildingArtifactKey,
  createCandidateId,
  error,
  isAnalyzing,
  now,
  profileSource,
  profiles,
  selectedProfile,
}: Readonly<{
  activeEngineId: string;
  buildingArtifactKey: string | null;
  createCandidateId: string | null;
  error: string | null;
  isAnalyzing: boolean;
  now: number;
  profileSource: VoiceProfileSource | null;
  profiles: VoiceProfile[];
  selectedProfile: VoiceProfile | null;
}>): VoiceCloningActivitySummary {
  const activeProfile = resolveActiveCloneProfile(selectedProfile, profiles, activeEngineId);
  const activeTargetIds = scopedProfileTargetIds(activeEngineId);
  const targetReady =
    Boolean(activeProfile) && isVoiceProfileTargetReadyForEngine(activeProfile, activeEngineId);
  const stages = resolveVoiceCloneStages(
    profileSource,
    activeProfile,
    buildingArtifactKey,
    activeTargetIds,
    activeEngineId,
  );
  const sourceActive = isAnalyzing || isVoiceProfileSourceActive(profileSource);
  const targetBuildActive = activeProfile
    ? buildingArtifactMatchesScope(activeProfile.id, buildingArtifactKey, activeTargetIds)
    : Boolean(buildingArtifactKey);
  const targetActive =
    targetBuildActive ||
    Boolean(createCandidateId) ||
    profileHasActiveTarget(activeProfile, activeTargetIds);
  const cancelled =
    profileSource?.status === "cancelled" ||
    profileHasTargetCancelled(activeProfile, activeTargetIds);
  const attention =
    Boolean(error) ||
    profileSource?.status === "failed" ||
    profileHasBlockingTargetAttention(activeProfile, activeTargetIds) ||
    (!cancelled && stages.some((stage) => stage.status === "failed"));
  const status = resolveVoiceCloneActivityStatus({
    activeProfile,
    attention,
    cancelled,
    sourceActive,
    targetActive,
    profileSource,
    targetReady,
  });
  const completionReference = resolveVoiceCloneCompletionReference(
    activeProfile,
    profileSource,
    activeTargetIds,
  );
  const nowForCloneTiming = resolveVoiceCloningActivityNow({
    completionReference,
    now,
    status,
  });
  const activityTimestamp = latestTimestamp(
    profileSource?.updatedAt,
    latestProfileActivityTimestamp(activeProfile, activeTargetIds),
  );
  const message =
    error ??
    (status === "complete" && activeProfile
      ? voiceProfileTargetReadinessText(activeProfile, activeEngineId)
      : sourceActivityMessage(profileSource));
  const candidates = profileSource?.candidates ?? [];
  const readyCandidates = candidates.filter((candidate) => candidate.status === "ready").length;
  const candidateDetail =
    candidates.length > 0
      ? `${String(readyCandidates)} ready / ${String(candidates.length)} detected`
      : "No candidates yet";
  return {
    activeProfile,
    actionLabel: resolveVoiceCloneActionLabel(status),
    candidateDetail,
    detail: voiceCloneDetail(profileSource, activeProfile, activeEngineId),
    elapsed: formatElapsed(profileSource?.createdAt ?? activeProfile?.createdAt, nowForCloneTiming),
    eta: voiceCloneEta(status),
    lastUpdate: formatRelativeTime(activityTimestamp, nowForCloneTiming),
    message,
    sourceDetail: voiceCloneSourceDetail(profileSource, activeProfile),
    stages,
    status,
    statusLabel: resolveVoiceCloneStatusLabel({ profileSource, sourceActive, status }),
  };
}
