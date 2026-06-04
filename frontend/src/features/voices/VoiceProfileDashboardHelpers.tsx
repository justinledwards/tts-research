import type { ReactNode } from "react";
import { Button, StatusChip } from "../../design";
import { formatLocaleNumber, languageDisplayName } from "../i18n";
import { providerCapabilityDataAttributes } from "../provider-capabilities";
import {
  voiceReadinessLabel,
  voiceReadinessTone,
  type VoiceCandidateSummary,
  type VoiceProfileSummary,
  type VoiceTargetSummary,
} from "./voiceProfileModel";

type MaybePromise = Promise<void> | void;

export function DashboardStatGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function DashboardStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border p-3 vs-border vs-raised">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function DetailFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border p-3 vs-border vs-surface">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

export function EmptyState({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-md border border-dashed p-4 text-sm leading-6 vs-border vs-muted">
      {children}
    </p>
  );
}

export function VoiceProfileRow({
  confirmingDeleteId,
  profile,
  selected,
  onConfirmingDeleteChange,
  onDeleteProfile,
  onSelectProfile,
}: Readonly<{
  confirmingDeleteId: string | null;
  profile: VoiceProfileSummary;
  selected: boolean;
  onConfirmingDeleteChange: (id: string | null) => void;
  onDeleteProfile: (id: string) => MaybePromise;
  onSelectProfile: (id: string) => void;
}>) {
  const isConfirming = confirmingDeleteId === profile.id;
  return (
    <div
      className={`grid gap-3 rounded-md border p-3 ${
        selected
          ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]"
          : "vs-border vs-surface"
      }`}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              className="min-w-0 truncate text-left text-base font-semibold hover:text-[var(--vs-selected-text)]"
              data-testid={`ui-action-voice-dashboard-select-${profile.id}`}
              data-ui-action-surface="Workspace"
              onClick={() => {
                onSelectProfile(profile.id);
              }}
              title={profile.name}
              type="button"
            >
              {profile.name}
            </button>
            {selected ? <StatusChip tone="accent">Selected</StatusChip> : null}
            <StatusChip tone="neutral">Cloned</StatusChip>
            <StatusChip tone={voiceReadinessTone(profile.readiness)}>
              {voiceReadinessLabel(profile.readiness)}
            </StatusChip>
          </div>
          <p className="vs-muted mt-1 text-xs">
            {languageDisplayName(profile.language)} · {formatDuration(profile.sourceDurationMs)} ·{" "}
            {formatLocaleNumber(profile.targetCount)} target
            {profile.targetCount === 1 ? "" : "s"} · {formatLocaleNumber(profile.artifactCount)}{" "}
            artifact
            {profile.artifactCount === 1 ? "" : "s"}
          </p>
          <p className="vs-muted mt-1 truncate text-xs" title={profile.candidateSource}>
            {profile.candidateSource}
          </p>
          <p className="vs-muted mt-1 truncate text-xs" title={profile.provenanceSummary}>
            {profile.provenanceSummary}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button
            data-testid={`ui-action-voice-dashboard-use-${profile.id}`}
            data-ui-action-surface="Workspace"
            onClick={() => {
              onSelectProfile(profile.id);
            }}
            selected={selected}
            size="sm"
            variant="secondary"
          >
            {selected ? "Selected" : "Use"}
          </Button>
          <Button
            data-testid={`ui-action-voice-dashboard-delete-${profile.id}`}
            data-ui-action-surface="Workspace"
            onClick={() => {
              onConfirmingDeleteChange(profile.id);
            }}
            size="sm"
            variant="destructive"
          >
            Delete
          </Button>
        </div>
      </div>
      {isConfirming ? (
        <div className="rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] p-3 text-sm text-[var(--vs-status-danger)]">
          <p className="font-semibold">Delete “{profile.name}”?</p>
          <p className="mt-1 text-xs leading-5">
            This removes the saved voice profile and its clone target metadata.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void Promise.resolve(onDeleteProfile(profile.id)).finally(() => {
                  onConfirmingDeleteChange(null);
                });
              }}
              size="sm"
              variant="destructive"
            >
              Delete Voice
            </Button>
            <Button
              onClick={() => {
                onConfirmingDeleteChange(null);
              }}
              size="sm"
              variant="secondary"
            >
              Keep Voice
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CandidateRow({ candidate }: Readonly<{ candidate: VoiceCandidateSummary }>) {
  return (
    <div className="rounded-md border p-3 vs-border vs-surface">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold" title={candidate.name}>
          {candidate.name}
        </p>
        <StatusChip tone={voiceReadinessTone(candidate.readiness)}>
          {candidate.suitability}
        </StatusChip>
      </div>
      <p className="vs-muted mt-1 text-xs">
        Score {formatLocaleNumber(Math.round(candidate.score * 100))}% · {candidate.status}
      </p>
      {candidate.warnings.length > 0 ? (
        <p className="vs-muted mt-2 text-xs leading-5">{candidate.warnings.join(" ")}</p>
      ) : null}
    </div>
  );
}

export function TargetRow({
  buildingArtifactKey,
  cancelingTargetKey,
  target,
  onBuildArtifact,
  onCancelTarget,
}: Readonly<{
  buildingArtifactKey: string | null;
  cancelingTargetKey: string | null;
  target: VoiceTargetSummary;
  onBuildArtifact: (profileId: string, moduleId: string) => Promise<void>;
  onCancelTarget: (profileId: string, targetId: string) => Promise<void>;
}>) {
  const targetKey = `${target.profileId}:${target.id}`;
  const isBuilding = buildingArtifactKey === targetKey;
  const isCanceling = cancelingTargetKey === targetKey;
  const isActive = ["queued", "building", "validating"].includes(target.status);
  const missingModuleId = !target.moduleId;
  const buildCapabilityReason = target.buildCapabilityReason;
  const cancelCapabilityReason = isActive ? target.cancelCapabilityReason : undefined;
  const buildDisabled = missingModuleId || isBuilding || Boolean(buildCapabilityReason);
  const cancelDisabled = !isActive || isCanceling || Boolean(cancelCapabilityReason);
  return (
    <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start vs-border vs-surface">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold" title={target.targetLabel}>
            {target.targetLabel}
          </p>
          <StatusChip tone={voiceReadinessTone(target.readiness)}>
            {voiceReadinessLabel(target.readiness)}
          </StatusChip>
          {target.selected ? <StatusChip tone="accent">Target</StatusChip> : null}
        </div>
        <p className="vs-muted mt-1 truncate text-xs">
          {target.profileName} · {target.moduleLabel} · {target.engineLabel}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button
          {...providerCapabilityDataAttributes("voiceCloning", buildCapabilityReason)}
          data-testid={`ui-action-voice-dashboard-build-${target.profileId}-${target.id}`}
          data-ui-action-surface="Workspace"
          disabled={buildDisabled}
          disabledReason={
            buildCapabilityReason ?? targetBuildDisabledReason({ isBuilding, missingModuleId })
          }
          onClick={() => {
            if (target.moduleId) {
              void onBuildArtifact(target.profileId, target.moduleId);
            }
          }}
          size="sm"
          variant="secondary"
        >
          {isBuilding ? "Building..." : "Build"}
        </Button>
        <Button
          {...providerCapabilityDataAttributes("cancelJob", cancelCapabilityReason)}
          data-testid={`ui-action-voice-dashboard-cancel-target-${target.profileId}-${target.id}`}
          data-ui-action-surface="Workspace"
          disabled={cancelDisabled}
          disabledReason={
            cancelCapabilityReason ?? targetCancelDisabledReason({ isActive, isCanceling })
          }
          onClick={() => {
            void onCancelTarget(target.profileId, target.id);
          }}
          size="sm"
          variant="destructive"
        >
          {isCanceling ? "Cancelling..." : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

export function voiceSourceCancelDisabled(
  status: string,
  {
    cancelingProfileSourceId,
    sourceId,
  }: Readonly<{ cancelingProfileSourceId: string | null; sourceId: string }>,
) {
  return cancelingProfileSourceId === sourceId || ["ready", "failed", "cancelled"].includes(status);
}

export function voiceSourceCancelDisabledReason(
  status: string,
  {
    cancelingProfileSourceId,
    sourceId,
  }: Readonly<{ cancelingProfileSourceId: string | null; sourceId: string }>,
) {
  if (cancelingProfileSourceId === sourceId) {
    return "Source cancellation is already in progress.";
  }
  if (["ready", "failed", "cancelled"].includes(status)) {
    return "Source analysis is not currently running.";
  }
}

export function targetBuildDisabledReason({
  isBuilding,
  missingModuleId,
}: Readonly<{ isBuilding: boolean; missingModuleId: boolean }>) {
  if (missingModuleId) {
    return "This target does not declare a clone module.";
  }
  if (isBuilding) {
    return "This target build is already running.";
  }
}

export function targetCancelDisabledReason({
  isActive,
  isCanceling,
}: Readonly<{ isActive: boolean; isCanceling: boolean }>) {
  if (isCanceling) {
    return "Target cancellation is already in progress.";
  }
  if (isActive) {
    return;
  }
  return "This target is not currently running.";
}

export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "0s";
  }
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) {
    return `${remainingSeconds.toString()}s`;
  }
  return `${minutes.toString()}m ${remainingSeconds.toString()}s`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
