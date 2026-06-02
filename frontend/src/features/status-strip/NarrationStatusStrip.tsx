import type { ActivityFooterMode } from "../../activityFooter";
import { Button, StatusChip, cx, type ButtonVariant } from "../../design";
import { overlayDataAttributes } from "../layout";
import type { NarrationStatusActionId, NarrationStatusChip, NarrationStatusModel } from "./model";

export interface NarrationStatusStripProps {
  readonly canCancel: boolean;
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly initialDrawerOpen?: boolean;
  readonly mode: ActivityFooterMode;
  readonly model: NarrationStatusModel;
  readonly selectedIssueId?: string | null;
  readonly onOpenActivity?: () => void;
  readonly onCancel: () => void;
  readonly onCreate: () => void;
  readonly onOpenDiagnostics?: () => void;
  readonly onOpenCinema: () => void;
  readonly onOpenIntake?: () => void;
  readonly onOpenReview?: () => void;
  readonly onOpenVoiceCloning: () => void;
  readonly onStatusChipSelect?: (chip: NarrationStatusChip) => void;
}

export function NarrationStatusStrip({
  canCancel,
  canCreate,
  canOpenCinema,
  mode,
  model,
  selectedIssueId = null,
  onOpenActivity,
  onCancel,
  onCreate,
  onOpenDiagnostics,
  onOpenCinema,
  onOpenIntake,
  onOpenReview,
  onOpenVoiceCloning,
  onStatusChipSelect,
}: NarrationStatusStripProps) {
  const isAttention =
    model.state === "blocked" || model.state === "failed" || model.state === "cancelled";
  const visibleChips = mode === "collapsed" ? model.chips.slice(0, 3) : model.chips;
  const actionDisabled = actionIsDisabled(model.primaryAction?.id ?? null, {
    canCancel,
    canCreate,
    canOpenCinema,
  });
  const showActivityRoute =
    Boolean(onOpenActivity) &&
    (model.state === "generating" ||
      model.state === "blocked" ||
      model.state === "failed" ||
      model.state === "cancelled" ||
      model.voiceCloning.status === "running" ||
      model.voiceCloning.status === "attention");
  return (
    <footer
      className={cx(
        "z-30 shrink-0 border-t px-3 py-2 shadow-[0_-8px_24px_rgb(15_23_42_/_0.08)] backdrop-blur lg:px-4 vs-border vs-raised",
        mode === "full" && "py-3",
      )}
      data-status-strip-density={statusStripDensityLabel(mode)}
      data-pipeline-state={model.state}
      data-testid="narration-status-strip"
      {...overlayDataAttributes("activity-footer", "bottom-activity-footer")}
    >
      <div
        className={cx(
          "grid min-w-0 gap-3 rounded-md border p-3 vs-border",
          isAttention
            ? "border-[var(--vs-warning-border)] bg-[var(--vs-warning-soft)]"
            : "bg-[var(--vs-surface)]",
          mode === "full"
            ? "xl:grid-cols-[minmax(0,1fr)_auto]"
            : "lg:grid-cols-[minmax(0,1fr)_auto]",
        )}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusChip tone={model.tone}>{model.primaryLabel}</StatusChip>
            <h2 className="min-w-0 truncate text-sm font-semibold" title={model.primaryMessage}>
              {model.primaryMessage}
            </h2>
            <span className="vs-muted min-w-0 truncate text-xs" title={model.detail}>
              {model.detail}
            </span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            {visibleChips.map((chip) => (
              <NarrationStatusSelectableChip
                chip={chip}
                key={chip.id}
                selected={selectedIssueId === chip.issue.id}
                onSelect={onStatusChipSelect}
              />
            ))}
            <span className="vs-muted text-xs">
              ETA {model.eta} · Job {model.activeJobLabel}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          {showActivityRoute ? (
            <Button
              data-testid="ui-action-status-strip-activity"
              onClick={onOpenActivity}
              size="sm"
              variant="secondary"
            >
              Activity
            </Button>
          ) : null}
          {model.primaryAction ? (
            <Button
              data-testid={`ui-action-status-strip-${model.primaryAction.id}`}
              disabled={actionDisabled}
              onClick={() => {
                runStatusAction(model.primaryAction?.id ?? null, {
                  onCancel,
                  onCreate,
                  onOpenDiagnostics,
                  onOpenCinema,
                  onOpenIntake,
                  onOpenReview,
                  onOpenVoiceCloning,
                });
              }}
              size="sm"
              variant={buttonVariant(model.primaryAction.tone)}
            >
              {model.primaryAction.label}
            </Button>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

function NarrationStatusSelectableChip({
  chip,
  selected,
  onSelect,
}: Readonly<{
  chip: NarrationStatusChip;
  selected: boolean;
  onSelect?: (chip: NarrationStatusChip) => void;
}>) {
  const content = (
    <StatusChip
      className={cx(
        "max-w-full rounded-full py-0.5 text-[0.65rem]",
        selected && "ring-2 ring-[var(--vs-focus-ring)]",
      )}
      tone={chip.tone}
    >
      <span className="shrink-0">{chip.label}</span>
      <span className="min-w-0 truncate before:px-1 before:content-['·']">{chip.value}</span>
    </StatusChip>
  );
  if (!onSelect) {
    return content;
  }
  return (
    <button
      aria-label={`Inspect ${chip.label}: ${chip.value}`}
      aria-pressed={selected}
      className="max-w-full rounded-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-focus-ring)]"
      data-testid={`ui-action-status-chip-${chip.id}`}
      onClick={() => {
        onSelect(chip);
      }}
      type="button"
    >
      {content}
    </button>
  );
}

function statusStripDensityLabel(mode: ActivityFooterMode): "compact" | "essential" | "expanded" {
  if (mode === "collapsed") {
    return "essential";
  }
  if (mode === "full") {
    return "expanded";
  }
  return "compact";
}

function runStatusAction(
  actionId: NarrationStatusActionId | null,
  handlers: Readonly<{
    onCancel: () => void;
    onCreate: () => void;
    onOpenDiagnostics?: () => void;
    onOpenCinema: () => void;
    onOpenIntake?: () => void;
    onOpenReview?: () => void;
    onOpenVoiceCloning: () => void;
  }>,
) {
  switch (actionId) {
    case "cancel": {
      handlers.onCancel();
      break;
    }
    case "create":
    case "retry": {
      handlers.onCreate();
      break;
    }
    case "openCinema": {
      handlers.onOpenCinema();
      break;
    }
    case "openDiagnostics": {
      handlers.onOpenDiagnostics?.();
      break;
    }
    case "openIntake": {
      handlers.onOpenIntake?.();
      break;
    }
    case "openReview": {
      handlers.onOpenReview?.();
      break;
    }
    case "openVoiceCloning": {
      handlers.onOpenVoiceCloning();
      break;
    }
    default: {
      break;
    }
  }
}

function actionIsDisabled(
  actionId: NarrationStatusActionId | null,
  state: Readonly<{ canCancel: boolean; canCreate: boolean; canOpenCinema: boolean }>,
): boolean {
  if (actionId === "cancel") {
    return !state.canCancel;
  }
  if (actionId === "create" || actionId === "retry") {
    return !state.canCreate;
  }
  if (actionId === "openCinema") {
    return !state.canOpenCinema;
  }
  return false;
}

function buttonVariant(tone: "danger" | "primary" | "secondary" | "warning"): ButtonVariant {
  if (tone === "primary") {
    return "primary";
  }
  if (tone === "danger") {
    return "destructive";
  }
  if (tone === "warning") {
    return "secondary";
  }
  return "secondary";
}
