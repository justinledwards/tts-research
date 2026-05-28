import { Panel, StatusChip } from "../../design";
import type { ReactNode } from "react";
import { ScopeBadge } from "./ScopeBadge";
import type { BookSource, PreparedSource, TTSEngineDiagnostics } from "../../types";
import {
  settingsGroupMeta,
  settingsGroupsForLayer,
  type SettingsCommandTarget,
  type SettingsGroupId,
  type SettingsLayerId,
  type SettingsScope,
} from "./model";

export function settingsCommandTargetToken(target: SettingsCommandTarget): string {
  if (target.fieldId) {
    return `field-${target.fieldId}`;
  }
  if (target.scope) {
    return `scope-${target.scope}`;
  }
  return `group-${target.groupId}`;
}

export function findSettingsCommandTargetElement(token: string): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>("[data-settings-command-targets]");
  for (const element of elements) {
    if (element.dataset.settingsCommandTargets?.split(" ").includes(token)) {
      return element;
    }
  }
  return null;
}

export function settingsGroupsForActiveLayer(activeLayer: SettingsLayerId) {
  if (activeLayer === "quick") {
    return [];
  }
  return settingsGroupsForLayer(activeLayer);
}

export function nextActiveGroupForLayer(layerId: SettingsLayerId, activeGroup: SettingsGroupId) {
  const activeGroupLayer = settingsGroupMeta(activeGroup).layer;
  if (layerId === "expert") {
    return activeGroupLayer === "expert" ? activeGroup : "runtime";
  }
  if (layerId === "advanced") {
    return activeGroupLayer === "advanced" ? activeGroup : "run";
  }
  return activeGroup;
}

export function quickSourceLabel(
  sourceMode: "book" | "fileUrl" | "text",
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
): string {
  if (sourceMode === "book") {
    return selectedBookSource?.title ?? selectedBookSource?.sourceFile ?? "No book selected";
  }
  if (sourceMode === "fileUrl") {
    return (
      selectedPreparedSource?.title ??
      selectedPreparedSource?.sourceName ??
      "No prepared source selected"
    );
  }
  return "Draft text";
}

export function engineFamilyOptions(engines: TTSEngineDiagnostics[]): TTSEngineDiagnostics[] {
  const source = engines.length > 0 ? engines : fallbackTTSEngines();
  return source.filter((engine) => engine.id !== "kokoro-clone" && engine.id !== "kokoro-embed");
}

function fallbackTTSEngines(): TTSEngineDiagnostics[] {
  return [
    {
      default: false,
      experimental: false,
      id: "auto",
      label: "Auto",
      local: true,
      status: "ready",
      supportsReference: true,
      supportsSSML: false,
      supportsSwedish: true,
      supportsVoice: true,
    },
  ];
}

export function formatProviderLanguageSummary(engine: TTSEngineDiagnostics): string {
  const count = engine.languages?.length ?? 0;
  if (count > 0) {
    return `${count.toLocaleString()} languages`;
  }
  return engine.supportsSwedish ? "Swedish" : "language auto";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function PanelSection({
  children,
  commandTargetTokens,
  highlightedCommandToken,
  scope,
  subtitle,
  title,
}: Readonly<{
  children: ReactNode;
  commandTargetTokens: string[];
  highlightedCommandToken: string | null;
  scope: SettingsScope;
  subtitle: string;
  title: string;
}>) {
  const isHighlighted = highlightedCommandToken
    ? commandTargetTokens.includes(highlightedCommandToken)
    : false;
  return (
    <Panel
      className="grid gap-3 p-4"
      data-settings-command-targets={commandTargetTokens.join(" ")}
      highlighted={isHighlighted}
      variant="raised"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="vs-muted mt-1 text-sm leading-6">{subtitle}</p>
        </div>
        <AppliesToScope scope={scope} />
      </div>
      {children}
    </Panel>
  );
}

export function AppliesToScope({ scope }: Readonly<{ scope: SettingsScope }>) {
  return (
    <StatusChip className="gap-2" tone="neutral">
      <span className="vs-muted">Applies to</span>
      <ScopeBadge scope={scope} />
    </StatusChip>
  );
}

export function DiagnosticLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="vs-muted">{label}</dt>
      <dd className="max-w-[65%] break-words text-right font-medium">{value}</dd>
    </div>
  );
}
