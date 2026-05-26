import { SegmentedControl, StatusChip, cx, type StatusChipTone } from "../../design";
import {
  timelineSourceLabel,
  type TelepromptCueSyncMode,
  type TelepromptCueSyncState,
} from "./telepromptCueTimeline";

export interface TelepromptCueSyncProps {
  readonly mode: TelepromptCueSyncMode;
  readonly playbackAvailable: boolean;
  readonly sync: TelepromptCueSyncState;
  readonly onModeChange: (mode: TelepromptCueSyncMode) => void;
}

const TELEPROMPT_CUE_SYNC_OPTIONS: readonly {
  readonly label: string;
  readonly mode: TelepromptCueSyncMode;
  readonly requiresPlayback: boolean;
}[] = [
  { label: "Manual", mode: "manual", requiresPlayback: false },
  { label: "Audio follow", mode: "audio-follow", requiresPlayback: true },
  { label: "Rehearsal", mode: "recording-rehearsal", requiresPlayback: false },
  { label: "Review", mode: "review-playback", requiresPlayback: true },
];

export function TelepromptCueSync({
  mode,
  playbackAvailable,
  sync,
  onModeChange,
}: Readonly<TelepromptCueSyncProps>) {
  return (
    <div
      className="grid gap-2 rounded-md border bg-[var(--vs-raised)] p-2 vs-border"
      data-testid="teleprompt-cue-sync"
      data-teleprompt-cue-sync-mode={mode}
      data-teleprompt-cue-sync-source={sync.source}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusChip tone={syncTone(sync)}>{sync.statusLabel}</StatusChip>
          <span className="text-xs font-semibold vs-muted">{timelineSourceLabel(sync.source)}</span>
        </div>
        <span
          className={cx(
            "text-xs font-semibold",
            sync.shouldFollowAudio ? "text-[var(--vs-success)]" : "vs-muted",
          )}
        >
          Cue {sync.activeCue ? sync.activeCue.sourceBlockId : "none"}
        </span>
      </div>
      <SegmentedControl
        ariaLabel="Teleprompt cue sync mode"
        columns={4}
        options={TELEPROMPT_CUE_SYNC_OPTIONS.map((option) => ({
          ariaLabel: `${option.label} cue sync mode`,
          disabled: option.requiresPlayback && !playbackAvailable,
          disabledReason:
            option.requiresPlayback && !playbackAvailable
              ? "Create audio before using timeline-follow cue sync."
              : undefined,
          label: option.label,
          testId: `ui-action-teleprompt-cue-sync-${option.mode}`,
          value: option.mode,
        }))}
        value={mode}
        onChange={onModeChange}
      />
      <p className="text-xs leading-5 vs-muted">{sync.detail}</p>
      {playbackAvailable ? null : (
        <p className="text-xs font-semibold text-[var(--vs-warning)]">
          Audio-follow and Review sync become available after Create & Listen.
        </p>
      )}
    </div>
  );
}

function syncTone(sync: TelepromptCueSyncState): StatusChipTone {
  if (sync.shouldFollowAudio) {
    return "success";
  }
  if (sync.mode === "audio-follow" || sync.mode === "review-playback") {
    return "warning";
  }
  return "neutral";
}
