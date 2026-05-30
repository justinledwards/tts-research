import { useState, type ReactNode } from "react";
import type { ActivityFooterMode } from "../../activityFooter";
import { Button, StatusChip, cx, type ButtonVariant } from "../../design";
import { Drawer } from "../../design/components/Drawer";
import type { StageStatus } from "../../types";
import { overlayDataAttributes } from "../layout";
import type {
  NarrationPipelineState,
  NarrationStatusActionId,
  NarrationStatusActivityItem,
  NarrationStatusModel,
} from "./model";

export interface NarrationStatusStripProps {
  readonly canCancel: boolean;
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly initialDrawerOpen?: boolean;
  readonly mode: ActivityFooterMode;
  readonly model: NarrationStatusModel;
  readonly onCancel: () => void;
  readonly onCreate: () => void;
  readonly onOpenCinema: () => void;
  readonly onOpenVoiceCloning: () => void;
}

export function NarrationStatusStrip({
  canCancel,
  canCreate,
  canOpenCinema,
  initialDrawerOpen = false,
  mode,
  model,
  onCancel,
  onCreate,
  onOpenCinema,
  onOpenVoiceCloning,
}: NarrationStatusStripProps) {
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);
  const isAttention =
    model.state === "blocked" || model.state === "failed" || model.state === "cancelled";
  const visibleChips = mode === "collapsed" ? model.chips.slice(0, 3) : model.chips;
  const actionDisabled = actionIsDisabled(model.primaryAction?.id ?? null, {
    canCancel,
    canCreate,
    canOpenCinema,
  });
  return (
    <>
      <footer
        className={cx(
          "z-30 shrink-0 border-t px-3 py-2 shadow-[0_-8px_24px_rgb(15_23_42_/_0.08)] backdrop-blur lg:px-4 vs-border vs-raised",
          mode === "full" && "py-3",
        )}
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
            <Button
              data-testid="ui-action-status-strip-activity"
              onClick={() => {
                setDrawerOpen(true);
              }}
              size="sm"
              variant="secondary"
            >
              Activity
            </Button>
          </div>
        </div>
      </footer>
      {drawerOpen ? (
        <ActivityDrawer
          model={model}
          onClose={() => {
            setDrawerOpen(false);
          }}
          onRunAction={(actionId) => {
            runStatusAction(actionId, {
              onCancel,
              onCreate,
              onOpenCinema,
              onOpenVoiceCloning,
            });
          }}
        />
      ) : null}
    </>
  );
}

function ActivityDrawer({
  model,
  onClose,
  onRunAction,
}: Readonly<{
  model: NarrationStatusModel;
  onClose: () => void;
  onRunAction: (actionId: NarrationStatusActionId) => void;
}>) {
  const primaryAction = model.primaryAction;
  const hideVoiceCloning = model.voiceCloning.status === "idle";
  return (
    <Drawer
      label="Narration activity"
      metadata={[
        { label: "State", value: model.primaryLabel },
        { label: "Job", value: model.activeJobLabel },
      ]}
      onClose={onClose}
      overlayOwner="activity-footer"
      overlayZone="bottom-activity-footer"
      scopeTitle={model.sourceTitle}
      title={model.primaryMessage}
    >
      <div className="grid gap-4" data-testid="narration-activity-drawer">
        <DrawerSection title="Current Status">
          <div className="grid gap-3 rounded-md border p-3 vs-border vs-surface">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={model.tone}>{model.primaryLabel}</StatusChip>
              {primaryAction ? (
                <Button
                  data-testid={`ui-action-activity-drawer-${primaryAction.id}`}
                  onClick={() => {
                    onRunAction(primaryAction.id);
                  }}
                  size="sm"
                  variant={buttonVariant(primaryAction.tone)}
                >
                  {primaryAction.label}
                </Button>
              ) : null}
            </div>
            <p className="text-sm font-semibold">{model.primaryMessage}</p>
            <p className="vs-muted text-sm leading-6">{model.detail}</p>
          </div>
        </DrawerSection>

        {model.blocker ? (
          <DrawerSection title="Current Blocker">
            <div className="rounded-md border border-[var(--vs-warning-border)] bg-[var(--vs-warning-soft)] p-3">
              <p className="text-sm font-semibold text-[var(--vs-warning)]">
                {model.blocker.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--vs-text)]">{model.blocker.detail}</p>
              {model.blocker.actionLabel ? (
                <p className="mt-2 text-xs font-semibold text-[var(--vs-warning)]">
                  Next: {model.blocker.actionLabel}
                </p>
              ) : null}
            </div>
          </DrawerSection>
        ) : null}

        <DrawerSection title="Readiness">
          <dl className="grid gap-2 sm:grid-cols-2">
            {model.chips.map((chip) => (
              <DrawerFact key={chip.id} label={chip.label} tone={chip.tone} value={chip.value} />
            ))}
            <DrawerFact label="ETA" value={model.eta} />
            <DrawerFact
              label="Confidence"
              value={model.confidenceLabel}
              detail={model.confidenceDetail}
            />
          </dl>
        </DrawerSection>

        <DrawerSection title="Stage Timeline">
          <ol className="grid gap-2 md:grid-cols-3">
            {model.stages.map((stage, index) => (
              <li className="rounded-md border p-3 vs-border vs-surface" key={stage.label}>
                <div className="flex items-center justify-between gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold vs-border">
                    {String(index + 1)}
                  </span>
                  <StatusChip tone={stageTone(stage.status)}>{stage.status}</StatusChip>
                </div>
                <p className="mt-3 text-sm font-semibold">{stage.label}</p>
                {stage.detail ? (
                  <p className="vs-muted mt-1 text-xs leading-5">{stage.detail}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </DrawerSection>

        <DrawerSection title="Queue and Job">
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <DrawerFact label="Current Segment" value={segmentValue(model.queue.currentSegment)} />
            <DrawerFact label="Ready" value={model.queue.readyCount.toString()} />
            <DrawerFact label="Generating" value={model.queue.generatingCount.toString()} />
            <DrawerFact label="Total" value={model.queue.totalSegments.toString()} />
          </dl>
          <p className="vs-muted mt-3 text-xs leading-5">{model.activeJobDetail}</p>
        </DrawerSection>

        {hideVoiceCloning ? null : (
          <DrawerSection title="Voice Cloning">
            <dl className="grid gap-2 sm:grid-cols-2">
              <DrawerFact label="State" value={model.voiceCloning.statusLabel} />
              <DrawerFact
                label="Elapsed"
                value={model.voiceCloning.elapsed}
                detail={model.voiceCloning.eta}
              />
              <DrawerFact label="Source" value={model.voiceCloning.sourceDetail} />
              <DrawerFact label="Candidates" value={model.voiceCloning.candidateDetail} />
            </dl>
            <p className="vs-muted mt-3 text-sm leading-6">{model.voiceCloning.message}</p>
          </DrawerSection>
        )}

        <DrawerSection title="Activity History">
          <ol className="grid gap-2">
            {model.activityItems.map((item) => (
              <ActivityItemRow item={item} key={item.id} />
            ))}
          </ol>
        </DrawerSection>

        <DrawerSection title="Recent Jobs">
          {model.recentJobs.length > 0 ? (
            <ol className="grid gap-2">
              {model.recentJobs.map((job) => (
                <li className="grid gap-1 rounded-md border p-3 vs-border vs-surface" key={job.id}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <StatusChip tone={job.tone}>{job.status}</StatusChip>
                    <p className="min-w-0 truncate text-sm font-semibold" title={job.title}>
                      {job.title}
                    </p>
                  </div>
                  <p className="vs-muted text-xs">{job.detail}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="vs-muted text-sm">No project jobs yet.</p>
          )}
        </DrawerSection>
      </div>
    </Drawer>
  );
}

function DrawerSection({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">{title}</h3>
      {children}
    </section>
  );
}

function DrawerFact({
  detail,
  label,
  tone = "neutral",
  value,
}: Readonly<{
  detail?: string;
  label: string;
  tone?: Parameters<typeof StatusChip>[0]["tone"];
  value: string;
}>) {
  return (
    <div className="min-w-0 rounded-md border p-3 vs-border vs-surface">
      <p className="vs-muted truncate text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
        {label}
      </p>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <StatusChip className="py-0.5 text-[0.65rem]" tone={tone}>
          {value}
        </StatusChip>
      </div>
      {detail ? (
        <p className="vs-muted mt-1 truncate text-xs" title={detail}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function ActivityItemRow({ item }: Readonly<{ item: NarrationStatusActivityItem }>) {
  return (
    <li className="grid gap-1 rounded-md border p-3 vs-border vs-surface">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StatusChip tone={item.tone}>{statusLabel(item.status)}</StatusChip>
        <p className="min-w-0 truncate text-sm font-semibold" title={item.title}>
          {item.title}
        </p>
      </div>
      <p className="vs-muted text-xs leading-5">{item.detail}</p>
    </li>
  );
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

function stageTone(status: string): Parameters<typeof StatusChip>[0]["tone"] {
  if (status === "done") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  if (status === "running") {
    return "info";
  }
  return "neutral";
}

function statusLabel(status: NarrationPipelineState | StageStatus): string {
  if (status === "done" || status === "failed" || status === "running" || status === "waiting") {
    return status;
  }
  return status.replaceAll("-", " ");
}

function segmentValue(value: number): string {
  return value > 0 ? value.toString() : "waiting";
}
