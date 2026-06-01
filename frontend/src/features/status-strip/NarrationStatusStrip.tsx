import type { ActivityFooterMode } from "../../activityFooter";
import { Button, StatusChip, cx, type ButtonVariant } from "../../design";
import { overlayDataAttributes } from "../layout";
import type { NarrationStatusActionId, NarrationStatusModel } from "./model";

export interface NarrationStatusStripProps {
  readonly canCancel: boolean;
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly initialDrawerOpen?: boolean;
  readonly mode: ActivityFooterMode;
  readonly model: NarrationStatusModel;
  readonly onOpenActivity?: () => void;
  readonly onCancel: () => void;
  readonly onCreate: () => void;
  readonly onOpenCinema: () => void;
  readonly onOpenVoiceCloning: () => void;
}

export function NarrationStatusStrip({
  canCancel,
  canCreate,
  canOpenCinema,
  mode,
  model,
  onOpenActivity,
  onCancel,
  onCreate,
  onOpenCinema,
  onOpenVoiceCloning,
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
              <StatusChip
                className="max-w-full rounded-full py-0.5 text-[0.65rem]"
                key={chip.id}
                tone={chip.tone}
              >
                <span className="shrink-0">{chip.label}</span>
                <span className="min-w-0 truncate before:px-1 before:content-['·']">
                  {chip.value}
                </span>
              </StatusChip>
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
                  onOpenCinema,
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
    onOpenCinema: () => void;
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
