import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, StatusChip, cx } from "../../design";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  shortcutAriaKeyShortcutsForCommand,
  shortcutTooltip,
  type ShortcutCommandId,
} from "../shortcuts/shortcutRegistry";
import {
  THEATRE_REVEALED_CONTROL_ZONE_ORDER,
  type TheatreAvailabilityState,
  type TheatreControlZone,
  type TheatreRuntimeMode,
} from "./model";

export interface FocusedTheatreControls {
  readonly blurControls: () => void;
  readonly controlsVisible: boolean;
  readonly focusControls: () => void;
  readonly hideControls: () => void;
  readonly revealControls: (intent?: FocusedTheatreRevealIntent) => void;
  readonly toggleControls: () => void;
}

export type FocusedTheatreRevealIntent = "intentional" | "passive";

export const FOCUSED_THEATRE_TOGGLE_CONTROLS_SELECTOR = "[data-focused-theatre-toggle-controls]";

export function focusedTheatreControlsMayReveal({
  explicitHideLocked,
  intent,
}: Readonly<{
  explicitHideLocked: boolean;
  intent: FocusedTheatreRevealIntent;
}>): boolean {
  return !(intent === "passive" && explicitHideLocked);
}

export interface FocusedTheatreAction {
  readonly ariaLabel?: string;
  readonly controlZone?: TheatreControlZone;
  readonly dataAttributes?: Record<string, string | undefined>;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly label: string;
  readonly primary?: boolean;
  readonly selected?: boolean;
  readonly shortcutCommandId?: ShortcutCommandId;
  readonly testId?: string;
  readonly onClick: () => void;
}

export interface FocusedTheatreProgress {
  readonly currentLabel?: string;
  readonly durationLabel?: string;
  readonly ratio: number;
}

export function useFocusedTheatreControls({
  active,
  autoHideMs = 4200,
  initialVisible = false,
}: Readonly<{
  active: boolean;
  autoHideMs?: number;
  initialVisible?: boolean;
}>): FocusedTheatreControls {
  const autoHideTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const explicitHideLockedRef = useRef(false);
  const focusWithinRef = useRef(false);
  const [controlsVisible, setControlsVisible] = useState(initialVisible);

  const clearAutoHide = useCallback(() => {
    if (autoHideTimerRef.current) {
      globalThis.clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const queueAutoHide = useCallback(() => {
    clearAutoHide();
    if (!active || autoHideMs <= 0) {
      return;
    }
    autoHideTimerRef.current = globalThis.setTimeout(() => {
      if (!focusWithinRef.current) {
        setControlsVisible(false);
      }
    }, autoHideMs);
  }, [active, autoHideMs, clearAutoHide]);

  const revealControls = useCallback(
    (intent: FocusedTheatreRevealIntent = "intentional") => {
      if (!active) {
        return;
      }
      if (
        !focusedTheatreControlsMayReveal({
          explicitHideLocked: explicitHideLockedRef.current,
          intent,
        })
      ) {
        return;
      }
      explicitHideLockedRef.current = false;
      setControlsVisible(true);
      queueAutoHide();
    },
    [active, queueAutoHide],
  );

  const focusControls = useCallback(() => {
    if (!active) {
      return;
    }
    explicitHideLockedRef.current = false;
    focusWithinRef.current = true;
    clearAutoHide();
    setControlsVisible(true);
  }, [active, clearAutoHide]);

  const blurControls = useCallback(() => {
    focusWithinRef.current = false;
    queueAutoHide();
  }, [queueAutoHide]);

  const hideControls = useCallback(() => {
    clearAutoHide();
    explicitHideLockedRef.current = true;
    focusWithinRef.current = false;
    setControlsVisible(false);
  }, [clearAutoHide]);

  const toggleControls = useCallback(() => {
    if (!active) {
      return;
    }
    setControlsVisible((current) => {
      const next = !current;
      if (next) {
        explicitHideLockedRef.current = false;
        queueAutoHide();
      } else {
        explicitHideLockedRef.current = true;
        clearAutoHide();
      }
      return next;
    });
  }, [active, clearAutoHide, queueAutoHide]);

  useEffect(() => {
    if (!active) {
      hideControls();
      return;
    }
    explicitHideLockedRef.current = false;
    focusWithinRef.current = false;
    setControlsVisible(initialVisible);
    if (initialVisible) {
      queueAutoHide();
    }
    return clearAutoHide;
  }, [active, clearAutoHide, hideControls, initialVisible, queueAutoHide]);

  useEffect(() => clearAutoHide, [clearAutoHide]);

  return {
    blurControls,
    controlsVisible,
    focusControls,
    hideControls,
    revealControls,
    toggleControls,
  };
}

export function FocusedTheatreChrome({
  actions,
  activeLabel,
  activeText,
  availabilityState,
  children,
  confidenceLabel,
  controlsVisible,
  persistentAction,
  progress,
  runtimeMode,
  scopeLabel,
  sourceLabel,
  statusLabel,
  surfaceLabel,
  syncStatusLabel,
  testId = "focused-theatre-chrome",
  toggleControlsTestId,
  onToggleControls,
}: Readonly<{
  actions?: readonly FocusedTheatreAction[];
  activeLabel: string;
  activeText?: string | null;
  availabilityState?: TheatreAvailabilityState | null;
  children?: ReactNode;
  confidenceLabel?: string | null;
  controlsVisible: boolean;
  persistentAction?: FocusedTheatreAction;
  progress?: FocusedTheatreProgress | null;
  runtimeMode?: TheatreRuntimeMode | null;
  scopeLabel?: string | null;
  sourceLabel?: string | null;
  statusLabel?: string | null;
  surfaceLabel: string;
  syncStatusLabel?: string | null;
  testId?: string;
  toggleControlsTestId?: string;
  onToggleControls: () => void;
}>) {
  const chromeActions = actions ?? [];
  return (
    <header
      className="focused-theatre-chrome shrink-0 border-b border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-chrome)] px-3 pt-[calc(0.45rem+env(safe-area-inset-top))] pb-2 text-[var(--vs-theatre-text)] shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur sm:px-4"
      data-focused-theatre-chrome=""
      data-focused-theatre-controls={controlsVisible ? "visible" : "hidden"}
      data-theatre-availability-state={availabilityState ?? undefined}
      data-theatre-runtime-mode={runtimeMode ?? undefined}
      data-testid={testId}
    >
      <div className="grid min-w-0 gap-2">
        <FocusedTheatreTitleRow
          activeLabel={activeLabel}
          controlsVisible={controlsVisible}
          persistentAction={persistentAction}
          scopeLabel={scopeLabel}
          sourceLabel={sourceLabel}
          statusLabel={statusLabel}
          surfaceLabel={surfaceLabel}
          testId={testId}
          toggleControlsTestId={toggleControlsTestId}
          onToggleControls={onToggleControls}
        />
        <FocusedTheatreProgressBar progress={progress} />
        <FocusedTheatreMeta confidenceLabel={confidenceLabel} syncStatusLabel={syncStatusLabel} />
        <FocusedTheatreDetail
          actions={chromeActions}
          activeText={activeText}
          controlsVisible={controlsVisible}
        >
          {children}
        </FocusedTheatreDetail>
      </div>
    </header>
  );
}

function FocusedTheatreTitleRow({
  activeLabel,
  controlsVisible,
  persistentAction,
  scopeLabel,
  sourceLabel,
  statusLabel,
  surfaceLabel,
  testId,
  toggleControlsTestId,
  onToggleControls,
}: Readonly<{
  activeLabel: string;
  controlsVisible: boolean;
  persistentAction?: FocusedTheatreAction;
  scopeLabel?: string | null;
  sourceLabel?: string | null;
  statusLabel?: string | null;
  surfaceLabel: string;
  testId: string;
  toggleControlsTestId?: string;
  onToggleControls: () => void;
}>) {
  const contextLabel = [sourceLabel, scopeLabel].filter(Boolean).join(" · ");
  const titleActions = persistentAction ? [persistentAction] : [];
  return (
    <div
      className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between"
      data-theatre-control-zone="persistent"
    >
      <div className="flex min-w-0 items-center gap-2">
        <StatusChip tone="success">{surfaceLabel}</StatusChip>
        <div className="min-w-0">
          <p
            className="truncate text-sm font-semibold text-[var(--vs-theatre-text)]"
            title={activeLabel}
          >
            {activeLabel}
          </p>
          <p className="truncate text-xs text-[var(--vs-text-muted)]" title={contextLabel}>
            {contextLabel}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:shrink-0 sm:justify-end">
        {statusLabel ? (
          <span
            className="max-w-[min(100%,18rem)] rounded-full border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] px-2 py-1 text-left text-xs font-semibold break-words text-[var(--vs-text-primary)] sm:max-w-full"
            title={statusLabel}
          >
            {statusLabel}
          </span>
        ) : null}
        <Button
          aria-label={controlsVisible ? "Hide controls" : "Show controls"}
          aria-keyshortcuts={shortcutAriaKeyShortcutsForCommand(
            "theatre.toggleControls",
            DEFAULT_SHORTCUT_PREFERENCES,
          )}
          className="border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] text-[var(--vs-theatre-text)] hover:bg-[var(--vs-theatre-panel)]"
          data-shortcut-command-id="theatre.toggleControls"
          data-focused-theatre-toggle-controls=""
          data-testid={toggleControlsTestId ?? `${testId}-toggle-controls`}
          onClick={onToggleControls}
          selected={controlsVisible}
          size="sm"
          title={shortcutTooltip(
            controlsVisible ? "Hide controls" : "Controls",
            "theatre.toggleControls",
            DEFAULT_SHORTCUT_PREFERENCES,
          )}
          variant="secondary"
        >
          {controlsVisible ? "Hide" : "Controls"}
        </Button>
        {titleActions.map((action) => (
          <FocusedTheatreButton action={action} key={action.testId ?? action.label} persistent />
        ))}
      </div>
    </div>
  );
}

function FocusedTheatreProgressBar({
  progress,
}: Readonly<{ progress?: FocusedTheatreProgress | null }>) {
  if (!progress) {
    return null;
  }
  const normalizedProgress = clampProgress(progress.ratio);
  return (
    <div className="grid gap-1" data-focused-theatre-progress="">
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--vs-surface-muted)]">
        <div
          className="h-full rounded-full bg-[var(--vs-theatre-accent)]"
          style={{ width: `${Math.round(normalizedProgress * 100).toString()}%` }}
        />
      </div>
      <div className="flex justify-between gap-3 text-xs tabular-nums text-[var(--vs-text-muted)]">
        <span>{progress.currentLabel ?? "0:00"}</span>
        <span>{progress.durationLabel ?? "--:--"}</span>
      </div>
    </div>
  );
}

function FocusedTheatreMeta({
  confidenceLabel,
  syncStatusLabel,
}: Readonly<{ confidenceLabel?: string | null; syncStatusLabel?: string | null }>) {
  if (!syncStatusLabel && !confidenceLabel) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-2 text-xs text-[var(--vs-text-secondary)]">
      {syncStatusLabel ? <span>{syncStatusLabel}</span> : null}
      {confidenceLabel ? <span>{confidenceLabel}</span> : null}
    </div>
  );
}

function FocusedTheatreDetail({
  actions,
  activeText,
  children,
  controlsVisible,
}: Readonly<{
  actions: readonly FocusedTheatreAction[];
  activeText?: string | null;
  children?: ReactNode;
  controlsVisible: boolean;
}>) {
  const hasDetail = Boolean(activeText?.trim()) || actions.length > 0 || Boolean(children);
  const actionGroups = groupFocusedTheatreActions(actions);
  if (!controlsVisible || !hasDetail) {
    return null;
  }
  return (
    <div className="grid gap-2" data-focused-theatre-detail="">
      {activeText?.trim() ? (
        <p
          className="line-clamp-2 hidden max-w-5xl text-sm leading-6 text-[var(--vs-text-secondary)] sm:block"
          data-focused-theatre-active-text=""
        >
          {activeText}
        </p>
      ) : null}
      {actionGroups.length > 0 ? (
        <div
          className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] px-2 py-2"
          data-focused-theatre-actions=""
        >
          {actionGroups.map((group) => (
            <div
              className={theatreActionGroupClassName(group.zone)}
              data-focused-theatre-action-group={group.zone}
              data-theatre-control-zone={group.zone}
              key={group.zone}
            >
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--vs-text-muted)]">
                {theatreActionGroupLabel(group.zone)}
              </span>
              {group.actions.map((action) => (
                <FocusedTheatreButton action={action} key={action.testId ?? action.label} />
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function FocusedTheatreButton({
  action,
  persistent = false,
}: Readonly<{ action: FocusedTheatreAction; persistent?: boolean }>) {
  return (
    <Button
      {...action.dataAttributes}
      aria-keyshortcuts={
        action.shortcutCommandId
          ? shortcutAriaKeyShortcutsForCommand(
              action.shortcutCommandId,
              DEFAULT_SHORTCUT_PREFERENCES,
            )
          : undefined
      }
      aria-label={action.ariaLabel}
      className={cx(
        action.primary || persistent
          ? "border-[var(--vs-theatre-panel-border)] bg-[var(--vs-surface-primary)] text-[var(--vs-text-primary)] hover:bg-[var(--vs-border-subtle)]"
          : "border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] text-[var(--vs-theatre-text)] hover:bg-[var(--vs-theatre-panel)]",
      )}
      data-theatre-control-zone={action.controlZone ?? (persistent ? "emergency" : "listener")}
      data-testid={action.testId}
      data-shortcut-command-id={action.shortcutCommandId}
      disabled={action.disabled}
      disabledReason={action.disabledReason}
      onClick={action.onClick}
      selected={action.selected}
      size="sm"
      title={shortcutTooltip(
        action.label,
        action.shortcutCommandId,
        DEFAULT_SHORTCUT_PREFERENCES,
        action.disabledReason,
      )}
      variant={action.primary || persistent ? "primary" : "secondary"}
    >
      {action.label}
    </Button>
  );
}

function groupFocusedTheatreActions(
  actions: readonly FocusedTheatreAction[],
): { actions: FocusedTheatreAction[]; zone: TheatreControlZone }[] {
  const byZone = new Map<TheatreControlZone, FocusedTheatreAction[]>();
  for (const action of actions) {
    const zone = action.controlZone ?? "listener";
    const existing = byZone.get(zone);
    if (existing) {
      existing.push(action);
      continue;
    }
    byZone.set(zone, [action]);
  }
  return THEATRE_REVEALED_CONTROL_ZONE_ORDER.flatMap((zone) => {
    const zoneActions = byZone.get(zone);
    return zoneActions ? [{ actions: zoneActions, zone }] : [];
  });
}

function theatreActionGroupClassName(zone: TheatreControlZone): string {
  return cx("flex min-w-0 flex-wrap items-center gap-2", zone === "emergency" && "ml-auto");
}

function theatreActionGroupLabel(zone: TheatreControlZone): string {
  switch (zone) {
    case "emergency": {
      return "Exit";
    }
    case "environment": {
      return "Display";
    }
    case "listener": {
      return "Listen";
    }
    case "operator": {
      return "Mode";
    }
    case "persistent": {
      return "Pinned";
    }
    case "return": {
      return "Return";
    }
  }
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
