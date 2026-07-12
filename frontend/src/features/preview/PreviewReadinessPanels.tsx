import type { ReactNode } from "react";
import {
  Button,
  fieldControlClassName,
  Panel,
  StatusChip,
  type StatusChipTone,
} from "../../design";
import type {
  PreviewReadinessModel,
  PreviewReadinessRow,
  PreviewReadinessRowStatus,
} from "./previewReadiness";

export const PREVIEW_AUDITION_NOT_FOUND_MESSAGE =
  "Audition could not find the current project or preview route. Projects were refreshed; restart the backend if this continues.";

export interface PreviewVoiceAuditionState {
  readonly detail: string;
  readonly label: string;
  readonly metadata?: string;
  readonly play: () => void;
  readonly status: "error" | "idle" | "loading" | "playing" | "ready";
}

export interface PreviewTemporaryVoiceOption {
  readonly detail: string;
  readonly id: string;
  readonly label: string;
}

export interface PreviewGeneratedAudioPanelProps {
  readonly detail: string;
  readonly isTemporarySource?: boolean;
  readonly playbackAvailable: boolean;
  readonly playbackToolbar: ReactNode;
  readonly status: PreviewReadinessRowStatus;
  readonly summary?: string;
}

export function PreviewReadinessChecklist({ model }: Readonly<{ model: PreviewReadinessModel }>) {
  return (
    <Panel
      as="section"
      aria-label="Preview readiness checklist"
      className="grid gap-2 p-3"
      data-testid="preview-readiness-checklist"
      variant={model.canCreate ? "workSurface" : "alert"}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Narration preflight</h3>
        <StatusChip tone={model.canCreate ? "success" : "warning"}>
          {model.canCreate ? "Ready to create" : "Needs attention"}
        </StatusChip>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {model.rows.map((row) => (
          <PreviewReadinessItem key={row.id} row={row} />
        ))}
      </div>
    </Panel>
  );
}

export function PreviewGeneratedAudioPanel({
  detail,
  isTemporarySource = false,
  playbackAvailable,
  playbackToolbar,
  status,
  summary,
}: Readonly<PreviewGeneratedAudioPanelProps>) {
  const emptyTitle = previewGeneratedAudioEmptyTitle(status);
  const title = isTemporarySource ? "Generated temporary audio" : "Generated audio playback";
  const statusLabel = playbackAvailable ? "Ready" : previewReadinessStatusLabel(status);
  const statusTone = playbackAvailable ? "success" : previewReadinessTone(status);
  const readySummary = isTemporarySource
    ? "Generated temporary audio is ready for this session."
    : "Full narration playback is ready for this scope.";
  const panelSummary =
    summary ??
    (playbackAvailable
      ? readySummary
      : "Generated audio appears here when playable media is available.");
  return (
    <Panel
      as="section"
      aria-label={title}
      className="grid gap-3 p-3"
      data-testid="preview-generated-audio-panel"
      variant="workSurface"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-5 vs-muted">{panelSummary}</p>
        </div>
        <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
      </div>
      {playbackAvailable ? (
        <div data-testid="preview-generated-audio-playback">{playbackToolbar}</div>
      ) : (
        <div
          aria-live="polite"
          className="grid gap-2 rounded-md border border-dashed border-[var(--vs-border-subtle)] p-3 vs-work-surface"
          data-testid="preview-generated-audio-empty-state"
        >
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
            Preview playback
          </p>
          <p className="text-sm font-semibold">{emptyTitle}</p>
          <p className="text-xs leading-5 vs-muted">{detail}</p>
        </div>
      )}
    </Panel>
  );
}

export function PreviewReadinessItem({ row }: Readonly<{ row: PreviewReadinessRow }>) {
  return (
    <Panel as="div" className="p-3" variant="metadata">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h4 className="text-sm font-semibold">{row.label}</h4>
        <StatusChip tone={previewReadinessTone(row.status)}>
          {previewReadinessStatusLabel(row.status)}
        </StatusChip>
      </div>
      <p className="mt-2 text-xs leading-5 vs-muted">{row.detail}</p>
    </Panel>
  );
}

export function PreviewConfirmationStrip({ model }: Readonly<{ model: PreviewReadinessModel }>) {
  return (
    <Panel
      as="section"
      aria-label="Preview configuration confirmation"
      className="grid gap-2 p-3 md:grid-cols-3 xl:grid-cols-6"
      data-testid="preview-confirmation-strip"
      variant="metadata"
    >
      {model.confirmations.map((item) => (
        <div className="min-w-0" key={item.label}>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
            {item.label}
          </p>
          <p className="mt-1 truncate text-sm font-semibold" title={item.value}>
            {item.value}
          </p>
        </div>
      ))}
    </Panel>
  );
}

export function VoiceAuditionPanel({
  disabledReason,
  sampleText,
  state,
  temporaryVoiceOptions = [],
  temporaryVoiceSelectionId,
  onTemporaryVoiceChange,
}: Readonly<{
  disabledReason?: string;
  sampleText: string;
  state: PreviewVoiceAuditionState;
  temporaryVoiceOptions?: readonly PreviewTemporaryVoiceOption[];
  temporaryVoiceSelectionId?: string;
  onTemporaryVoiceChange?: (voiceId: string) => void;
}>) {
  const disabled = Boolean(disabledReason) || state.status === "loading";
  const showTemporaryVoiceSelection =
    Boolean(temporaryVoiceSelectionId) &&
    temporaryVoiceOptions.length > 0 &&
    onTemporaryVoiceChange;
  return (
    <Panel
      as="section"
      aria-label="Voice audition"
      className="grid gap-3 p-3"
      data-testid="preview-audition-panel"
      variant="management"
    >
      <div>
        <h3 className="text-base font-semibold">Audition voice</h3>
        <p className="mt-1 text-xs vs-muted">
          Plays a short selected-block sample without creating full narration audio.
        </p>
      </div>
      {showTemporaryVoiceSelection ? (
        <div
          className="grid gap-2 rounded-md border p-3 vs-border vs-work-surface"
          data-testid="preview-temporary-voice-selection"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <label
              className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted"
              htmlFor="preview-temporary-voice-select"
            >
              Use this voice for temporary source
            </label>
            <StatusChip tone="info">Session voice override</StatusChip>
          </div>
          <select
            className={fieldControlClassName}
            data-testid="ui-action-preview-temporary-voice-select"
            data-ui-action-surface="Preview"
            id="preview-temporary-voice-select"
            onChange={(event) => {
              onTemporaryVoiceChange(event.currentTarget.value);
            }}
            value={temporaryVoiceSelectionId}
          >
            {temporaryVoiceOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs leading-5 vs-muted">
            Temporary voice choices stay in this session. Provider-backed voice generation can send
            request text, selected voice settings, and run configuration to the configured provider.
          </p>
        </div>
      ) : null}
      <p className="line-clamp-3 rounded-md px-3 py-2 text-sm leading-6 vs-work-surface">
        {sampleText || "Select a spoken block to audition."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-playback-action="audition"
          data-playback-owner="preview"
          data-testid="ui-action-preview-audition-voice"
          data-ui-action-owner="preview"
          data-ui-action-surface="Preview"
          disabled={disabled}
          disabledReason={
            disabledReason ?? (state.status === "loading" ? "Audition is loading." : undefined)
          }
          onClick={state.play}
          size="sm"
          variant="soft"
        >
          {state.status === "loading" ? "Loading..." : state.label}
        </Button>
        <StatusChip tone={voiceAuditionTone(state.status)}>
          {voiceAuditionStatusLabel(state.status)}
        </StatusChip>
        {state.metadata ? <span className="text-xs vs-muted">{state.metadata}</span> : null}
      </div>
      <p className="text-xs leading-5 vs-muted">{disabledReason ?? state.detail}</p>
    </Panel>
  );
}

export function previewReadinessTone(status: PreviewReadinessRowStatus): StatusChipTone {
  if (status === "ready") {
    return "success";
  }
  if (status === "working") {
    return "info";
  }
  if (status === "warning") {
    return "warning";
  }
  if (status === "blocked") {
    return "failed";
  }
  return "neutral";
}

export function previewReadinessStatusLabel(status: PreviewReadinessRowStatus): string {
  if (status === "ready") {
    return "Ready";
  }
  if (status === "working") {
    return "Working";
  }
  if (status === "blocked") {
    return "Blocked";
  }
  if (status === "warning") {
    return "Needs attention";
  }
  return "Waiting";
}

export function previewGeneratedAudioEmptyTitle(status: PreviewReadinessRowStatus): string {
  if (status === "working") {
    return "Audio is being prepared";
  }
  if (status === "warning") {
    return "Audio needs retry";
  }
  if (status === "blocked") {
    return "Playback is unavailable";
  }
  return "Audio not generated yet";
}

export function voiceAuditionTone(status: PreviewVoiceAuditionState["status"]): StatusChipTone {
  if (status === "playing" || status === "ready") {
    return "success";
  }
  if (status === "loading") {
    return "info";
  }
  if (status === "error") {
    return "failed";
  }
  return "neutral";
}

export function voiceAuditionStatusLabel(status: PreviewVoiceAuditionState["status"]): string {
  if (status === "playing") {
    return "Playing";
  }
  if (status === "loading") {
    return "Preparing";
  }
  if (status === "ready") {
    return "Ready";
  }
  if (status === "error") {
    return "Attention";
  }
  return "Waiting";
}
