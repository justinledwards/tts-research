import { useMemo, useRef, useState } from "react";
import { Button, Panel, StatusChip } from "../../design";
import { formatLocaleNumber, languageDisplayName } from "../i18n";
import { PrivacyBoundaryPanel, PRIVACY_NOTICES, privacyBoundaryCatalog } from "../privacy";
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
