import { Button, SegmentedControl, StatusChip, cx } from "./design";
import { CommandIcon, SettingsIcon } from "./features/navigation/SurfaceActions";
import {
  WORKSPACE_LAYOUT_MODES,
  WORKSPACE_LAYOUT_SLOT_DENSITIES,
  WORKSPACE_LAYOUT_SLOTS,
  workspaceLayoutModeMeta,
  workspaceLayoutSlotDensityMeta,
  workspaceLayoutSlotMeta,
  type WorkspaceCustomLayout,
  type WorkspaceLayoutMode,
  type WorkspaceLayoutSlot,
  type WorkspaceLayoutSlotDensity,
} from "./features/workspace/model";
import {
  WORKSPACE_DISCLOSURE_PANEL_IDS,
  workspaceDisclosurePanelMeta,
  type WorkspaceDisclosurePanelId,
  type WorkspaceDisclosurePins,
} from "./features/workspace/disclosure";
import type { RunConfiguration } from "./runConfig";
import { describePerformanceMode } from "./runConfig";

export type StudioMode = "narration" | "voiceCloning";

export interface ShellWorkContext {
  readonly chapterName: string;
  readonly projectName: string;
  readonly workspaceLabel: string;
}

export function TopProductBar({
  commandPaletteShortcutLabel,
  runConfiguration,
  settingsShortcutLabel,
  studioMode,
  workContext,
  workspaceCustomLayout,
  workspaceDisclosurePins,
  workspaceLayoutMode,
  onCommandPaletteOpen,
  onSettingsOpen,
  onStudioModeChange,
  onWorkspaceCustomLayoutChange,
  onWorkspaceDisclosurePinChange,
  onWorkspaceLayoutModeChange,
  onCommandCenterOpen,
  quickListenEnabled = true,
  onQuickListenOpen,
}: Readonly<{
  commandPaletteShortcutLabel: string;
  runConfiguration: RunConfiguration;
  settingsShortcutLabel: string;
  studioMode: StudioMode;
  workContext: ShellWorkContext;
  workspaceCustomLayout: WorkspaceCustomLayout;
  workspaceDisclosurePins: WorkspaceDisclosurePins;
  workspaceLayoutMode: WorkspaceLayoutMode;
  onCommandPaletteOpen: () => void;
  onSettingsOpen: () => void;
  onStudioModeChange: (mode: StudioMode) => void;
  onWorkspaceCustomLayoutChange: (layout: WorkspaceCustomLayout) => void;
  onWorkspaceDisclosurePinChange: (panelId: WorkspaceDisclosurePanelId, pinned: boolean) => void;
  onWorkspaceLayoutModeChange: (mode: WorkspaceLayoutMode) => void;
  onCommandCenterOpen: () => void;
  quickListenEnabled?: boolean;
  onQuickListenOpen: () => void;
}>) {
  return (
    <header className="vs-app-shell grid min-h-[58px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 lg:gap-3 lg:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Button
          aria-label="Open Command Center"
          data-testid="ui-action-workspace-open-menu"
          onClick={onCommandCenterOpen}
          size="icon"
          variant="ghost"
        >
          <MenuIcon />
        </Button>
        <div className="min-w-0 md:shrink-0">
          <h1 className="truncate text-sm font-semibold tracking-normal sm:text-xl md:whitespace-nowrap">
            Voice Studio
          </h1>
          <p className="vs-muted hidden truncate text-xs sm:block">
            Reading studio · {describePerformanceMode(runConfiguration.performanceMode)}
          </p>
        </div>
      </div>
      <TopProductBarContextSummary
        context={workContext}
        onOpenCommandCenter={onCommandCenterOpen}
      />
      <nav
        aria-label="Primary workspace actions"
        className="hidden min-w-0 items-center justify-end gap-1 md:flex"
      >
        <SegmentedControl
          ariaLabel="Studio mode"
          className="min-w-[210px]"
          options={[
            { label: "Narration", testId: "ui-action-studio-mode-narration", value: "narration" },
            {
              label: "Voice Cloning",
              testId: "ui-action-studio-mode-voice-cloning",
              value: "voiceCloning",
            },
          ]}
          value={studioMode}
          onChange={onStudioModeChange}
        />
        <WorkspaceLayoutControl
          compact
          customLayout={workspaceCustomLayout}
          disclosurePins={workspaceDisclosurePins}
          layoutMode={workspaceLayoutMode}
          onCustomLayoutChange={onWorkspaceCustomLayoutChange}
          onDisclosurePinChange={onWorkspaceDisclosurePinChange}
          onLayoutModeChange={onWorkspaceLayoutModeChange}
        />
        {quickListenEnabled ? (
          <Button
            aria-label="Open Quick Listen"
            className="gap-2 px-3"
            data-command-id="quick-listen:open"
            data-testid="ui-action-quick-listen-open"
            data-ui-action-owner="quick-listen"
            onClick={onQuickListenOpen}
            size="md"
            title="Quick Listen"
            variant="primary"
          >
            <ListenIcon />
            <span className="hidden xl:inline">Quick Listen</span>
          </Button>
        ) : null}
        <Button
          aria-label="Open command palette"
          className="gap-2 px-3"
          data-command-id="command.palette"
          data-shortcut-command-id="command.palette"
          data-testid="ui-action-command-palette-open"
          data-ui-action-owner="command-palette"
          onClick={() => {
            onCommandPaletteOpen();
          }}
          size="md"
          title={`Actions (${commandPaletteShortcutLabel})`}
          variant="secondary"
        >
          <CommandIcon />
          <span className="hidden xl:inline">Actions</span>
        </Button>
        <Button
          aria-label="Open settings"
          data-command-id="settings:open"
          data-shortcut-command-id="settings.open"
          data-testid="ui-action-settings-open"
          data-ui-action-owner="settings"
          onClick={onSettingsOpen}
          size="icon"
          title={`Settings (${settingsShortcutLabel})`}
          variant="secondary"
        >
          <SettingsIcon />
        </Button>
      </nav>
      <nav aria-label="Primary workspace actions" className="flex items-center gap-1.5 md:hidden">
        <Button
          className="px-2 text-[var(--vs-action-primary)]"
          onClick={() => {
            onStudioModeChange(studioMode === "narration" ? "voiceCloning" : "narration");
          }}
          size="sm"
          variant="secondary"
        >
          {studioMode === "narration" ? "Narration" : "Cloning"}
        </Button>
        <WorkspaceLayoutControl
          compact
          customLayout={workspaceCustomLayout}
          disclosurePins={workspaceDisclosurePins}
          layoutMode={workspaceLayoutMode}
          onCustomLayoutChange={onWorkspaceCustomLayoutChange}
          onDisclosurePinChange={onWorkspaceDisclosurePinChange}
          onLayoutModeChange={onWorkspaceLayoutModeChange}
        />
        {quickListenEnabled ? (
          <Button
            aria-label="Open Quick Listen"
            className="text-[var(--vs-action-primary)]"
            data-command-id="quick-listen:open"
            data-testid="ui-action-quick-listen-open"
            data-ui-action-owner="quick-listen"
            onClick={onQuickListenOpen}
            size="icon"
            title="Quick Listen"
            variant="secondary"
          >
            <ListenIcon />
          </Button>
        ) : null}
        <Button
          aria-label="Open command palette"
          className="text-[var(--vs-action-primary)]"
          data-command-id="command.palette"
          data-shortcut-command-id="command.palette"
          data-testid="ui-action-command-palette-open"
          data-ui-action-owner="command-palette"
          onClick={() => {
            onCommandPaletteOpen();
          }}
          size="icon"
          title={`Actions (${commandPaletteShortcutLabel})`}
          variant="secondary"
        >
          <CommandIcon />
        </Button>
        <Button
          aria-label="Open settings"
          className="text-[var(--vs-action-primary)]"
          data-command-id="settings:open"
          data-shortcut-command-id="settings.open"
          data-testid="ui-action-settings-open"
          data-ui-action-owner="settings"
          onClick={onSettingsOpen}
          size="icon"
          title={`Settings (${settingsShortcutLabel})`}
          variant="secondary"
        >
          <SettingsIcon />
        </Button>
      </nav>
    </header>
  );
}

export function WorkspaceLayoutControl({
  compact = false,
  customLayout,
  disclosurePins,
  layoutMode,
  onCustomLayoutChange,
  onDisclosurePinChange,
  onLayoutModeChange,
}: Readonly<{
  compact?: boolean;
  customLayout: WorkspaceCustomLayout;
  disclosurePins: WorkspaceDisclosurePins;
  layoutMode: WorkspaceLayoutMode;
  onCustomLayoutChange: (layout: WorkspaceCustomLayout) => void;
  onDisclosurePinChange: (panelId: WorkspaceDisclosurePanelId, pinned: boolean) => void;
  onLayoutModeChange: (mode: WorkspaceLayoutMode) => void;
}>) {
  const activeMeta = workspaceLayoutModeMeta(layoutMode);
  return (
    <details
      className={cx("group relative", compact ? "" : "hidden lg:block")}
      data-testid="ui-action-workspace-layout-menu"
    >
      <summary
        aria-label={`Workspace layout: ${activeMeta.label}`}
        className={cx(
          "flex min-h-10 cursor-pointer list-none items-center justify-center rounded-md border px-3 text-sm font-semibold shadow-sm transition hover:bg-[var(--vs-surface)] vs-work-surface [&::-webkit-details-marker]:hidden",
          compact ? "min-w-11 px-2 text-[var(--vs-action-primary)]" : "min-w-36 gap-2",
        )}
      >
        <span>Layout</span>
        {compact ? null : (
          <StatusChip className="rounded-full py-0.5 text-[0.65rem]" tone="metadata">
            {activeMeta.label}
          </StatusChip>
        )}
      </summary>
      <div
        className={cx(
          "absolute right-0 z-50 mt-2 grid w-[min(22rem,calc(100vw-1rem))] gap-3 rounded-lg border p-3 text-sm shadow-xl vs-work-surface",
          compact ? "-right-20" : "",
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          {WORKSPACE_LAYOUT_MODES.map((mode) => {
            const meta = workspaceLayoutModeMeta(mode);
            return (
              <Button
                align="start"
                aria-label={`${meta.label} workspace layout`}
                className="min-w-0 flex-col gap-1 px-3 py-2"
                data-testid={`ui-action-workspace-layout-${mode}`}
                key={mode}
                onClick={(event) => {
                  onLayoutModeChange(mode);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
                selected={layoutMode === mode}
                size="sm"
                variant={layoutMode === mode ? "pinned" : "secondary"}
              >
                <span className="truncate text-sm font-semibold">{meta.label}</span>
                <span className="line-clamp-2 text-left text-xs vs-muted">{meta.description}</span>
              </Button>
            );
          })}
        </div>
        <div className="grid gap-2 border-t pt-3 vs-border">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
              Custom layout
            </p>
            <p className="mt-1 text-xs vs-muted">
              Set panel density here without adding controls to every panel.
            </p>
          </div>
          {WORKSPACE_LAYOUT_SLOTS.map((slot) => (
            <WorkspaceLayoutSlotControl
              density={customLayout[slot]}
              key={slot}
              slot={slot}
              onDensityChange={(density) => {
                onCustomLayoutChange({
                  ...customLayout,
                  [slot]: density,
                });
              }}
            />
          ))}
        </div>
        <div className="grid gap-2 border-t pt-3 vs-border">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
              Advanced pins
            </p>
            <p className="mt-1 text-xs vs-muted">
              Keep frequently used advanced systems expanded when they are available.
            </p>
          </div>
          {WORKSPACE_DISCLOSURE_PANEL_IDS.map((panelId) => (
            <WorkspaceDisclosurePinControl
              key={panelId}
              panelId={panelId}
              pinned={disclosurePins[panelId]}
              onPinnedChange={(pinned) => {
                onDisclosurePinChange(panelId, pinned);
              }}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

function WorkspaceLayoutSlotControl({
  density,
  slot,
  onDensityChange,
}: Readonly<{
  density: WorkspaceLayoutSlotDensity;
  slot: WorkspaceLayoutSlot;
  onDensityChange: (density: WorkspaceLayoutSlotDensity) => void;
}>) {
  const slotMeta = workspaceLayoutSlotMeta(slot);
  return (
    <div className="grid gap-1">
      <p className="truncate text-xs font-semibold" title={slotMeta.description}>
        {slotMeta.label}
      </p>
      <div className="grid grid-cols-3 gap-1">
        {WORKSPACE_LAYOUT_SLOT_DENSITIES.map((item) => {
          const meta = workspaceLayoutSlotDensityMeta(item);
          const label = workspaceLayoutDensityLabel(slot, item);
          return (
            <Button
              aria-label={`${slotMeta.label} ${label}`}
              className="min-w-0 px-2 text-xs"
              data-testid={`ui-action-workspace-layout-custom-${slot}-${item}`}
              key={item}
              onClick={() => {
                onDensityChange(item);
              }}
              selected={density === item}
              size="sm"
              title={workspaceLayoutDensityDescription(slot, item, meta.description)}
              variant={density === item ? "pinned" : "secondary"}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function workspaceLayoutDensityLabel(
  slot: WorkspaceLayoutSlot,
  density: WorkspaceLayoutSlotDensity,
): string {
  if (slot === "systemStatus" && density === "hidden") {
    return "Essential";
  }
  if (slot === "systemStatus" && density === "summary") {
    return "Compact";
  }
  if (slot === "systemStatus" && density === "pinned") {
    return "Expanded";
  }
  return workspaceLayoutSlotDensityMeta(density).label;
}

function workspaceLayoutDensityDescription(
  slot: WorkspaceLayoutSlot,
  density: WorkspaceLayoutSlotDensity,
  fallback: string,
): string {
  if (slot !== "systemStatus") {
    return fallback;
  }
  if (density === "hidden") {
    return "Keep the essential status strip only.";
  }
  if (density === "summary") {
    return "Show the compact production status strip.";
  }
  return "Show expanded status and diagnostics entry points.";
}

function WorkspaceDisclosurePinControl({
  panelId,
  pinned,
  onPinnedChange,
}: Readonly<{
  panelId: WorkspaceDisclosurePanelId;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
}>) {
  const meta = workspaceDisclosurePanelMeta(panelId);
  return (
    <Button
      align="start"
      aria-pressed={pinned}
      className="min-w-0 justify-between gap-2 px-3 py-2"
      data-testid={`ui-action-workspace-disclosure-pin-${panelId}`}
      onClick={() => {
        onPinnedChange(!pinned);
      }}
      selected={pinned}
      size="sm"
      title={meta.detail}
      variant={pinned ? "pinned" : "secondary"}
    >
      <span className="min-w-0 truncate text-left text-xs font-semibold">{meta.label}</span>
      <span className="shrink-0 text-[0.65rem]">{pinned ? "Pinned" : "Auto"}</span>
    </Button>
  );
}

function TopProductBarContextSummary({
  context,
  onOpenCommandCenter,
}: Readonly<{
  context: ShellWorkContext;
  onOpenCommandCenter: () => void;
}>) {
  return (
    <button
      className="hidden min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left transition hover:bg-[var(--vs-surface-muted)] vs-metadata-surface lg:flex"
      data-testid="ui-action-shell-context-summary"
      onClick={onOpenCommandCenter}
      title={`${context.workspaceLabel} · ${context.projectName} · ${context.chapterName}`}
      type="button"
    >
      <span className="vs-muted shrink-0 text-[0.64rem] font-semibold uppercase tracking-[0.16em]">
        Work
      </span>
      <span className="min-w-0 truncate text-sm font-semibold">{context.workspaceLabel}</span>
      <span aria-hidden="true" className="vs-muted shrink-0 text-xs">
        /
      </span>
      <span className="min-w-0 truncate text-sm font-semibold">{context.projectName}</span>
      <span aria-hidden="true" className="vs-muted shrink-0 text-xs">
        /
      </span>
      <span className="min-w-0 truncate text-sm font-semibold">{context.chapterName}</span>
    </button>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ListenIcon({ className = "h-4 w-4" }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M5 14v-2a7 7 0 0 1 14 0v2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M5 14h2.5a1.5 1.5 0 0 1 1.5 1.5v2A1.5 1.5 0 0 1 7.5 19H6a2 2 0 0 1-2-2v-1a2 2 0 0 1 1-2ZM19 14h-2.5a1.5 1.5 0 0 0-1.5 1.5v2a1.5 1.5 0 0 0 1.5 1.5H18a2 2 0 0 0 2-2v-1a2 2 0 0 0-1-2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path d="M11 10v4l3-2-3-2Z" fill="currentColor" />
    </svg>
  );
}
