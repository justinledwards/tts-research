import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Panel, StatusChip } from "../../design";
import { formatLocaleNumber, languageDisplayName } from "../i18n";
import { PrivacyBoundaryPanel, PRIVACY_NOTICES, privacyBoundaryCatalog } from "../privacy";
import { providerCapabilityDataAttributes } from "../provider-capabilities";
import { useReaderModalLifecycle } from "../reader-accessibility";
import type {
  ResearchModuleDiagnostics,
  TTSEngineDiagnostics,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
} from "../../types";
import { buildVoiceDiagnostics } from "./voiceDiagnostics";
import {
  buildVoiceProfileDashboardModel,
  voiceReadinessLabel,
  voiceReadinessTone,
  type VoiceCandidateSummary,
  type VoiceProfileSummary,
  type VoiceTargetSummary,
} from "./voiceProfileModel";

type MaybePromise = Promise<void> | void;

export interface VoiceProfileDashboardProps {
  buildingArtifactKey: string | null;
  cancelingProfileSourceId: string | null;
  cancelingTargetKey: string | null;
  diagnostics: VoiceProfileSourceDiagnostics | null;
  profileSource: VoiceProfileSource | null;
  profiles: VoiceProfile[];
  researchModules: ResearchModuleDiagnostics[];
  selectedProfileId: string;
  ttsEngines: TTSEngineDiagnostics[];
  onBuildArtifact: (profileId: string, moduleId: string) => Promise<void>;
  onCancelProfileSource: (sourceId: string) => Promise<void>;
  onCancelProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onClose: () => void;
  onDeleteProfile: (id: string) => MaybePromise;
  onOpenVoiceCloning: () => void;
  onSelectProfile: (id: string) => void;
}

export function VoiceProfileDashboard({
  buildingArtifactKey,
  cancelingProfileSourceId,
  cancelingTargetKey,
  diagnostics,
  profileSource,
  profiles,
  researchModules,
  selectedProfileId,
  ttsEngines,
  onBuildArtifact,
  onCancelProfileSource,
  onCancelProfileTarget,
  onClose,
  onDeleteProfile,
  onOpenVoiceCloning,
  onSelectProfile,
}: Readonly<VoiceProfileDashboardProps>) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(dialogRef, { closeOnEscape: true, isOpen: true, onClose });
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const model = useMemo(
    () =>
      buildVoiceProfileDashboardModel({
        engines: ttsEngines,
        modules: researchModules,
        profiles,
        selectedProfileId,
        source: profileSource,
      }),
    [profileSource, profiles, researchModules, selectedProfileId, ttsEngines],
  );
  const diagnosticItems = useMemo(
    () => buildVoiceDiagnostics({ diagnostics, modules: researchModules }),
    [diagnostics, researchModules],
  );
  const selectedProfile = model.selectedProfile;
  const selectedArtifacts = Object.entries(selectedProfile?.cloneArtifacts ?? {});

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/35 p-3 md:p-6" role="presentation">
      <aside
        aria-label="Voice Profile Dashboard"
        aria-modal="true"
        className="vs-app mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg border shadow-2xl vs-border vs-raised"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b p-4 md:p-5 vs-border">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
              Voice assets
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Voice Profile Dashboard</h2>
            <p className="vs-muted mt-2 max-w-3xl text-sm leading-6">
              Manage saved voices, recordings, candidates, clone targets, and readiness diagnostics
              in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="ui-action-voice-dashboard-import"
              data-ui-action-surface="Workspace"
              disabled
              disabledReason="Voice profile bundle import is not available in this local build."
              size="sm"
              variant="secondary"
            >
              Import Voice
            </Button>
            <Button
              data-testid="ui-action-voice-dashboard-export"
              data-ui-action-surface="Workspace"
              disabled
              disabledReason="Voice profile bundle export is not available in this local build."
              size="sm"
              variant="secondary"
            >
              Export Voice
            </Button>
            <Button
              data-testid="ui-action-voice-dashboard-open-cloning"
              data-ui-action-surface="Workspace"
              onClick={onOpenVoiceCloning}
              size="sm"
              variant="primary"
            >
              Open Voice Studio
            </Button>
            <Button
              data-testid="ui-action-voice-dashboard-close"
              data-ui-action-surface="Workspace"
              onClick={onClose}
              size="sm"
              variant="ghost"
            >
              Close
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          <DashboardStatGrid>
            <DashboardStat label="Saved Voices" value={formatLocaleNumber(model.totals.profiles)} />
            <DashboardStat
              label="Ready Voices"
              value={formatLocaleNumber(model.totals.readyProfiles)}
            />
            <DashboardStat label="Candidates" value={formatLocaleNumber(model.totals.candidates)} />
            <DashboardStat label="Clone Targets" value={formatLocaleNumber(model.totals.targets)} />
            <DashboardStat
              label="Ready Targets"
              value={formatLocaleNumber(model.totals.readyTargets)}
            />
          </DashboardStatGrid>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="grid min-w-0 gap-4">
              <Panel title={`Saved Voices (${formatLocaleNumber(model.profiles.length)})`}>
                <div className="grid gap-3 p-3">
                  {model.profiles.map((profile) => (
                    <VoiceProfileRow
                      confirmingDeleteId={confirmingDeleteId}
                      key={profile.id}
                      profile={profile}
                      selected={profile.id === selectedProfile?.id}
                      onConfirmingDeleteChange={setConfirmingDeleteId}
                      onDeleteProfile={onDeleteProfile}
                      onSelectProfile={onSelectProfile}
                    />
                  ))}
                  {model.profiles.length === 0 ? (
                    <EmptyState>
                      Saved voices will appear here after analysis creates profiles.
                    </EmptyState>
                  ) : null}
                </div>
              </Panel>

              <Panel title={`Candidates (${formatLocaleNumber(model.candidates.length)})`}>
                <div className="grid gap-2 p-3">
                  {model.candidates.map((candidate) => (
                    <CandidateRow candidate={candidate} key={candidate.id} />
                  ))}
                  {model.candidates.length === 0 ? (
                    <EmptyState>No voice candidates are currently staged.</EmptyState>
                  ) : null}
                </div>
              </Panel>

              <Panel title={`Targets (${formatLocaleNumber(model.targets.length)})`}>
                <div className="grid gap-2 p-3">
                  {model.targets.map((target) => (
                    <TargetRow
                      buildingArtifactKey={buildingArtifactKey}
                      cancelingTargetKey={cancelingTargetKey}
                      key={`${target.profileId}:${target.id}`}
                      target={target}
                      onBuildArtifact={onBuildArtifact}
                      onCancelTarget={onCancelProfileTarget}
                    />
                  ))}
                  {model.targets.length === 0 ? (
                    <EmptyState>
                      Clone targets will appear after a voice is prepared for an engine.
                    </EmptyState>
                  ) : null}
                </div>
              </Panel>
            </div>

            <div className="grid content-start gap-4">
              <PrivacyBoundaryPanel
                boundaries={privacyBoundaryCatalog.voiceProfile}
                compact
                title="Voice data boundary"
              />

              <Panel title="Selected Voice">
                <div className="grid gap-3 p-3">
                  {selectedProfile ? (
                    <>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold" title={selectedProfile.name}>
                          {selectedProfile.name}
                        </p>
                        <p className="vs-muted mt-1 text-sm">
                          {languageDisplayName(selectedProfile.language)} ·{" "}
                          {formatDuration(
                            selectedProfile.referenceDurationMs ?? selectedProfile.durationMs,
                          )}
                        </p>
                      </div>
                      <StatusChip tone={selectedProfile.status === "ready" ? "success" : "warning"}>
                        {selectedProfile.status}
                      </StatusChip>
                      <DetailFact
                        label="Source"
                        value={selectedProfile.speakerName ?? selectedProfile.sourceFile}
                      />
                      <DetailFact
                        label="Reference"
                        value={`${formatBytes(selectedProfile.sourceBytes)} · ${selectedProfile.audioFormat}`}
                      />
                      <DetailFact
                        label="Clone artifacts"
                        value={formatLocaleNumber(selectedArtifacts.length)}
                      />
                    </>
                  ) : (
                    <EmptyState>
                      Select or create a voice profile to see readiness detail.
                    </EmptyState>
                  )}
                </div>
              </Panel>

              <Panel title="Source Recording">
                <div className="grid gap-3 p-3">
                  {model.source ? (
                    <>
                      <DetailFact label="File" value={model.source.fileName} />
                      <DetailFact label="Status" value={model.source.status} />
                      <DetailFact
                        label="Candidates"
                        value={formatLocaleNumber(model.source.candidateCount)}
                      />
                      <p className="vs-muted rounded-md border p-3 text-xs leading-5 vs-border vs-surface">
                        {model.source.progress}
                      </p>
                      <p
                        className="vs-muted rounded-md border p-3 text-xs leading-5 vs-border vs-surface"
                        data-privacy-notice={PRIVACY_NOTICES.voiceProfileLocal.id}
                      >
                        {PRIVACY_NOTICES.voiceProfileLocal.message}
                      </p>
                      <Button
                        data-testid="ui-action-voice-dashboard-cancel-source"
                        data-ui-action-surface="Workspace"
                        disabled={voiceSourceCancelDisabled(model.source.status, {
                          cancelingProfileSourceId,
                          sourceId: model.source.id,
                        })}
                        disabledReason={voiceSourceCancelDisabledReason(model.source.status, {
                          cancelingProfileSourceId,
                          sourceId: model.source.id,
                        })}
                        onClick={() => {
                          void onCancelProfileSource(model.source?.id ?? "");
                        }}
                        size="sm"
                        variant="destructive"
                      >
                        {cancelingProfileSourceId === model.source.id
                          ? "Cancelling..."
                          : "Cancel Analysis"}
                      </Button>
                    </>
                  ) : (
                    <EmptyState>No source recording is being analyzed.</EmptyState>
                  )}
                </div>
              </Panel>

              <Panel title="Diagnostics">
                <div className="grid gap-2 p-3">
                  {diagnosticItems.map((item) => (
                    <div className="rounded-md border p-3 vs-border vs-surface" key={item.id}>
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <StatusChip tone={item.tone}>{item.value}</StatusChip>
                      </div>
                      <p className="vs-muted mt-2 text-xs leading-5">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function VoiceProfileRow({
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
        selected ? "border-orange-300 bg-orange-500/5" : "vs-border vs-surface"
      }`}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              className="min-w-0 truncate text-left text-base font-semibold hover:text-orange-700"
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
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
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

function CandidateRow({ candidate }: Readonly<{ candidate: VoiceCandidateSummary }>) {
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

function TargetRow({
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

function voiceSourceCancelDisabled(
  status: string,
  {
    cancelingProfileSourceId,
    sourceId,
  }: Readonly<{ cancelingProfileSourceId: string | null; sourceId: string }>,
) {
  return cancelingProfileSourceId === sourceId || ["ready", "failed", "cancelled"].includes(status);
}

function voiceSourceCancelDisabledReason(
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

function targetBuildDisabledReason({
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

function targetCancelDisabledReason({
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

function DashboardStatGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function DashboardStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border p-3 vs-border vs-raised">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function DetailFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border p-3 vs-border vs-surface">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-md border border-dashed p-4 text-sm leading-6 vs-border vs-muted">
      {children}
    </p>
  );
}

function formatDuration(milliseconds: number): string {
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

function formatBytes(bytes: number): string {
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
