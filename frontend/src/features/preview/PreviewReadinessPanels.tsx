import { Button, StatusChip, type StatusChipTone } from "../../design";
import type {
  PreviewReadinessModel,
  PreviewReadinessRow,
  PreviewReadinessRowStatus,
} from "./previewReadiness";

export interface PreviewVoiceAuditionState {
  readonly detail: string;
  readonly label: string;
  readonly metadata?: string;
  readonly play: () => void;
  readonly status: "error" | "idle" | "loading" | "playing" | "ready";
}

export function PreviewReadinessChecklist({ model }: Readonly<{ model: PreviewReadinessModel }>) {
  return (
    <section
      aria-label="Preview readiness checklist"
      className="grid gap-2 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border"
      data-testid="preview-readiness-checklist"
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
    </section>
  );
}

export function PreviewReadinessItem({ row }: Readonly<{ row: PreviewReadinessRow }>) {
  return (
    <div className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 vs-border">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h4 className="text-sm font-semibold">{row.label}</h4>
        <StatusChip tone={previewReadinessTone(row.status)}>
          {previewReadinessStatusLabel(row.status)}
        </StatusChip>
      </div>
      <p className="mt-2 text-xs leading-5 vs-muted">{row.detail}</p>
    </div>
  );
}

export function PreviewConfirmationStrip({ model }: Readonly<{ model: PreviewReadinessModel }>) {
  return (
    <section
      aria-label="Preview configuration confirmation"
      className="grid gap-2 rounded-lg border bg-[var(--vs-raised)] p-3 vs-border md:grid-cols-3 xl:grid-cols-6"
      data-testid="preview-confirmation-strip"
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
    </section>
  );
}

export function VoiceAuditionPanel({
  disabledReason,
  sampleText,
  state,
}: Readonly<{
  disabledReason?: string;
  sampleText: string;
  state: PreviewVoiceAuditionState;
}>) {
  const disabled = Boolean(disabledReason) || state.status === "loading";
  return (
    <section
      aria-label="Voice audition"
      className="grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border"
      data-testid="preview-audition-panel"
    >
      <div>
        <h3 className="text-base font-semibold">Audition voice</h3>
        <p className="mt-1 text-xs vs-muted">
          Plays a short selected-block sample without creating full narration audio.
        </p>
      </div>
      <p className="line-clamp-3 rounded-md bg-[var(--vs-raised)] px-3 py-2 text-sm leading-6 vs-border">
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
    </section>
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
    return "warning";
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
    return "Review";
  }
  return "Waiting";
}

export function voiceAuditionTone(status: PreviewVoiceAuditionState["status"]): StatusChipTone {
  if (status === "playing" || status === "ready") {
    return "success";
  }
  if (status === "loading") {
    return "info";
  }
  if (status === "error") {
    return "warning";
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
