import { useMemo, useRef, useState } from "react";
import { Button, Panel, StatusChip } from "../../design";
import { formatLocaleNumber, languageDisplayName } from "../i18n";
import { PrivacyBoundaryPanel, PRIVACY_NOTICES, privacyBoundaryCatalog } from "../privacy";
import { useReaderModalLifecycle } from "../reader-accessibility";
import type {
  ResearchModuleDiagnostics,
  TemporarySourceSession,
  TTSEngineDiagnostics,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
} from "../../types";
import { buildVoiceDiagnostics } from "./voiceDiagnostics";
import {
  CandidateRow,
  DashboardStat,
  DashboardStatGrid,
  DetailFact,
  EmptyState,
  TargetRow,
  VoiceProfileRow,
  formatBytes,
  formatDuration,
  voiceSourceCancelDisabled,
  voiceSourceCancelDisabledReason,
} from "./VoiceProfileDashboardHelpers";
import { buildVoiceProfileDashboardModel } from "./voiceProfileModel";
import {
  buildTemporaryVoiceDashboardModel,
  type TemporaryVoiceDashboardModel,
  type TemporaryVoiceSelection,
  type TemporaryVoiceState,
} from "./temporaryVoiceModel";

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
  temporarySourceId: string | null;
  temporarySources: TemporarySourceSession[];
  temporaryVoiceState: TemporaryVoiceState;
  ttsEngines: TTSEngineDiagnostics[];
  onBuildArtifact: (profileId: string, moduleId: string) => Promise<void>;
  onCancelProfileSource: (sourceId: string) => Promise<void>;
  onCancelProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onConfirmTemporaryCloneConsent: (temporarySourceId: string) => void;
  onClose: () => void;
  onDeleteProfile: (id: string) => MaybePromise;
  onOpenVoiceCloning: () => void;
  onSaveTemporaryVoicePreference: (selection: TemporaryVoiceSelection) => void;
  onSelectProfile: (id: string) => void;
  onUseProfileForTemporarySource: (profileId: string) => void;
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
  temporarySourceId,
  temporarySources,
  temporaryVoiceState,
  ttsEngines,
  onBuildArtifact,
  onCancelProfileSource,
  onCancelProfileTarget,
  onConfirmTemporaryCloneConsent,
  onClose,
  onDeleteProfile,
  onOpenVoiceCloning,
  onSaveTemporaryVoicePreference,
  onSelectProfile,
  onUseProfileForTemporarySource,
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
  const temporaryVoiceModel = useMemo(
    () =>
      buildTemporaryVoiceDashboardModel({
        activeTemporarySourceId: temporarySourceId,
        profiles,
        state: temporaryVoiceState,
        temporarySources,
        ttsEngines,
      }),
    [profiles, temporarySourceId, temporarySources, temporaryVoiceState, ttsEngines],
  );
  const selectedProfile = model.selectedProfile;
  const selectedArtifacts = Object.entries(selectedProfile?.cloneArtifacts ?? {});

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--vs-surface-overlay)] p-3 md:p-6"
      role="presentation"
    >
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
            <DashboardStat
              label="Cloned Voices"
              value={formatLocaleNumber(model.totals.profiles)}
            />
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
                      onUseTemporarySource={
                        temporarySourceId ? onUseProfileForTemporarySource : undefined
                      }
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

              <TemporaryVoiceUsagePanel
                activeTemporarySourceId={temporarySourceId}
                model={temporaryVoiceModel}
                onConfirmTemporaryCloneConsent={onConfirmTemporaryCloneConsent}
                onOpenVoiceCloning={onOpenVoiceCloning}
                onSaveTemporaryVoicePreference={onSaveTemporaryVoicePreference}
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
                      <DetailFact label="Asset type" value="Cloned voice profile" />
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
                      <DetailFact
                        label="Provenance"
                        value={
                          model.profiles.find((profile) => profile.id === selectedProfile.id)
                            ?.provenanceSummary ?? "Legacy profile: provenance not recorded"
                        }
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
                      <DetailFact label="Provenance" value={model.source.provenanceSummary} />
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

function TemporaryVoiceUsagePanel({
  activeTemporarySourceId,
  model,
  onConfirmTemporaryCloneConsent,
  onOpenVoiceCloning,
  onSaveTemporaryVoicePreference,
}: Readonly<{
  activeTemporarySourceId: string | null;
  model: TemporaryVoiceDashboardModel;
  onConfirmTemporaryCloneConsent: (temporarySourceId: string) => void;
  onOpenVoiceCloning: () => void;
  onSaveTemporaryVoicePreference: (selection: TemporaryVoiceSelection) => void;
}>) {
  const activeUsage = activeTemporarySourceId
    ? model.activeUsage.find((usage) => usage.temporarySourceId === activeTemporarySourceId)
    : null;
  return (
    <Panel title="Temporary Voice Usage">
      <div className="grid gap-3 p-3">
        <DetailFact
          label="Temporary sessions using voices"
          value={formatLocaleNumber(model.activeUsage.length)}
        />
        {activeUsage ? (
          <>
            <div className="rounded-md border p-3 vs-border vs-surface">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p
                  className="min-w-0 truncate text-sm font-semibold"
                  title={activeUsage.sessionLabel}
                >
                  {activeUsage.sessionLabel}
                </p>
                <StatusChip tone="metadata">Session scoped</StatusChip>
              </div>
              <p className="vs-muted mt-2 text-xs leading-5">
                {activeUsage.currentSelection.label} · {activeUsage.currentSelection.kind}
              </p>
              <p className="vs-muted mt-1 text-xs">
                {formatLocaleNumber(activeUsage.auditionCount)} audition
                {activeUsage.auditionCount === 1 ? "" : "s"}
                {activeUsage.lastAuditionAt
                  ? ` · latest ${formatTimestamp(activeUsage.lastAuditionAt)}`
                  : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  data-testid="ui-action-voice-dashboard-save-temporary-preference"
                  data-ui-action-surface="Workspace"
                  onClick={() => {
                    onSaveTemporaryVoicePreference(activeUsage.currentSelection);
                  }}
                  size="sm"
                  variant="primary"
                >
                  Save voice preference to project
                </Button>
                <Button
                  data-testid="ui-action-voice-dashboard-open-cloning-from-temporary"
                  data-ui-action-surface="Workspace"
                  onClick={onOpenVoiceCloning}
                  size="sm"
                  variant="secondary"
                >
                  Start in Voice Studio
                </Button>
              </div>
            </div>
            {model.cloneConsentRequired ? (
              <div className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] p-3 text-sm text-[var(--vs-status-warning)]">
                <p className="font-semibold">Temporary media needs consent before cloning</p>
                <p className="mt-1 text-xs leading-5">
                  Using this session as reference media requires explicit provenance confirmation in
                  Voice Studio.
                </p>
                <Button
                  data-testid="ui-action-voice-dashboard-confirm-temporary-clone-consent"
                  data-ui-action-surface="Workspace"
                  onClick={() => {
                    onConfirmTemporaryCloneConsent(activeTemporarySourceId ?? "");
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Confirm provenance gate
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState>No active temporary source is using a session voice.</EmptyState>
        )}

        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
            Audition history for current session
          </p>
          {model.auditionHistory.map((audition) => (
            <div className="rounded-md border p-3 vs-border vs-surface" key={audition.id}>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold" title={audition.selection.label}>
                  {audition.selection.label}
                </p>
                <StatusChip tone={audition.result === "failed" ? "danger" : "success"}>
                  {audition.result}
                </StatusChip>
              </div>
              <p className="vs-muted mt-1 truncate text-xs" title={audition.sample}>
                {audition.sample || "Preview sample"}
              </p>
            </div>
          ))}
          {model.auditionHistory.length === 0 ? (
            <EmptyState>No temporary auditions have been recorded for this session.</EmptyState>
          ) : null}
        </div>

        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
            Temporary provider diagnostics
          </p>
          {model.diagnostics.map((item) => (
            <div className="rounded-md border p-3 vs-border vs-surface" key={item.id}>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <p className="text-sm font-semibold">{item.label}</p>
                <StatusChip tone={temporaryDiagnosticTone(item.status)}>{item.status}</StatusChip>
              </div>
              <p className="vs-muted mt-2 text-xs leading-5">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function temporaryDiagnosticTone(status: "attention" | "ready" | "warning") {
  if (status === "attention") {
    return "danger" as const;
  }
  if (status === "ready") {
    return "success" as const;
  }
  return "warning" as const;
}
