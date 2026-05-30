import type { ActivityFooterMode } from "../../activityFooter";
import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";
import type { WorkspaceRailMode, WorkspaceStage } from "./model";

export const DISCLOSURE_STATUSES = [
  "hidden",
  "collapsed",
  "available",
  "active",
  "warning",
  "blocking",
] as const;

export type DisclosureStatus = (typeof DISCLOSURE_STATUSES)[number];

export const WORKSPACE_DISCLOSURE_PANEL_IDS = [
  "voiceCloning",
  "diagnostics",
  "sourceDetails",
  "audioGeneration",
  "exportImport",
  "storage",
  "backendState",
] as const;

export type WorkspaceDisclosurePanelId = (typeof WORKSPACE_DISCLOSURE_PANEL_IDS)[number];

export type WorkspaceDisclosurePins = Record<WorkspaceDisclosurePanelId, boolean>;

export interface WorkspaceDisclosurePanelMeta {
  readonly detail: string;
  readonly id: WorkspaceDisclosurePanelId;
  readonly label: string;
}

export interface DisclosurePanelState {
  readonly detail: string;
  readonly id: WorkspaceDisclosurePanelId;
  readonly pinned: boolean;
  readonly status: DisclosureStatus;
  readonly title: string;
}

export interface WorkspaceDisclosureModel {
  readonly attentionCount: number;
  readonly highestPriorityPanel: DisclosurePanelState | null;
  readonly panels: Record<WorkspaceDisclosurePanelId, DisclosurePanelState>;
}

export interface WorkspaceDisclosureRails {
  readonly activityFooterMode: ActivityFooterMode;
  readonly leftRailMode: WorkspaceRailMode;
  readonly rightRailMode: WorkspaceRailMode;
}

export interface WorkspaceDisclosureInput {
  readonly audioGeneration: {
    readonly lifecycle: GeneratedAudioLifecycleState;
    readonly requiresPlayback: boolean;
  };
  readonly backendState: {
    readonly active: boolean;
    readonly blocking: boolean;
    readonly detail?: string;
    readonly online: boolean;
    readonly warning: boolean;
  };
  readonly diagnostics: {
    readonly active: boolean;
    readonly blocking: boolean;
    readonly detail?: string;
    readonly warning: boolean;
  };
  readonly exportImport: {
    readonly active: boolean;
    readonly blocking: boolean;
    readonly detail?: string;
    readonly warning: boolean;
  };
  readonly pins?: Partial<WorkspaceDisclosurePins> | null;
  readonly sourceDetails: {
    readonly active: boolean;
    readonly blocking: boolean;
    readonly detail?: string;
    readonly hasSource: boolean;
    readonly warning: boolean;
  };
  readonly stage: WorkspaceStage;
  readonly storage: {
    readonly blocking: boolean;
    readonly detail?: string;
    readonly warning: boolean;
  };
  readonly voiceCloning: {
    readonly blocking: boolean;
    readonly detail?: string;
    readonly status: "idle" | "running" | "attention" | "complete" | "cancelled";
  };
}

type DisclosureRuleInput = Readonly<{
  available?: boolean;
  blocking?: boolean;
  collapsed?: boolean;
  hidden?: boolean;
  pinned?: boolean;
  active?: boolean;
  warning?: boolean;
}>;

export const DEFAULT_WORKSPACE_DISCLOSURE_PINS: WorkspaceDisclosurePins = {
  audioGeneration: false,
  backendState: false,
  diagnostics: false,
  exportImport: false,
  sourceDetails: false,
  storage: false,
  voiceCloning: false,
};

export const WORKSPACE_DISCLOSURE_PANEL_META: Record<
  WorkspaceDisclosurePanelId,
  WorkspaceDisclosurePanelMeta
> = {
  audioGeneration: {
    detail: "Narration progress, playable audio, stale audio, and failed generation.",
    id: "audioGeneration",
    label: "Audio generation",
  },
  backendState: {
    detail: "Provider readiness, engine capability, and backend health.",
    id: "backendState",
    label: "Backend state",
  },
  diagnostics: {
    detail: "Setup, provider, model, and quality diagnostics.",
    id: "diagnostics",
    label: "Diagnostics",
  },
  exportImport: {
    detail: "Portable project bundle review, import, and export.",
    id: "exportImport",
    label: "Export/import",
  },
  sourceDetails: {
    detail: "Source structure, preparation, policy scope, and selected material.",
    id: "sourceDetails",
    label: "Source details",
  },
  storage: {
    detail: "Current project asset size and storage fetch state.",
    id: "storage",
    label: "Storage",
  },
  voiceCloning: {
    detail: "Reference analysis, candidates, clone targets, and clone readiness.",
    id: "voiceCloning",
    label: "Voice cloning",
  },
};

const DISCLOSURE_PRIORITY: Record<DisclosureStatus, number> = {
  blocking: 60,
  warning: 50,
  active: 40,
  available: 30,
  collapsed: 20,
  hidden: 10,
};

export function normalizeWorkspaceDisclosurePins(value: unknown): WorkspaceDisclosurePins {
  const candidate =
    value && typeof value === "object" ? (value as Partial<WorkspaceDisclosurePins>) : {};
  return Object.fromEntries(
    WORKSPACE_DISCLOSURE_PANEL_IDS.map((panelId) => [panelId, candidate[panelId] === true]),
  ) as WorkspaceDisclosurePins;
}

export function workspaceDisclosurePinsEqual(
  left: WorkspaceDisclosurePins,
  right: WorkspaceDisclosurePins,
): boolean {
  return WORKSPACE_DISCLOSURE_PANEL_IDS.every((panelId) => left[panelId] === right[panelId]);
}

export function workspaceDisclosurePanelMeta(
  panelId: WorkspaceDisclosurePanelId,
): WorkspaceDisclosurePanelMeta {
  return WORKSPACE_DISCLOSURE_PANEL_META[panelId];
}

export function resolveDisclosureStatus(input: DisclosureRuleInput): DisclosureStatus {
  if (input.blocking) {
    return "blocking";
  }
  if (input.warning) {
    return "warning";
  }
  if (input.active) {
    return "active";
  }
  if (input.pinned && input.available) {
    return "available";
  }
  if (input.available) {
    return "available";
  }
  if (input.collapsed) {
    return "collapsed";
  }
  return input.hidden ? "hidden" : "collapsed";
}

export function disclosurePriority(panel: DisclosurePanelState): number {
  const pinBonus = panel.status === "available" && panel.pinned ? 5 : 0;
  return DISCLOSURE_PRIORITY[panel.status] + pinBonus;
}

export function shouldExpandDisclosurePanel(panel: DisclosurePanelState): boolean {
  return (
    panel.status === "blocking" ||
    panel.status === "warning" ||
    panel.status === "active" ||
    (panel.status === "available" && panel.pinned)
  );
}

export function disclosureRequiresAttention(panel: DisclosurePanelState): boolean {
  return panel.status === "blocking" || panel.status === "warning";
}

export function resolveWorkspaceDisclosure(
  input: WorkspaceDisclosureInput,
): WorkspaceDisclosureModel {
  const pins = normalizeWorkspaceDisclosurePins(input.pins);
  const panels: Record<WorkspaceDisclosurePanelId, DisclosurePanelState> = {
    audioGeneration: panelState({
      detail: audioGenerationDetail(input.audioGeneration.lifecycle),
      id: "audioGeneration",
      input: audioGenerationDisclosure(input.audioGeneration),
      pins,
      title: "Audio generation",
    }),
    backendState: panelState({
      detail:
        input.backendState.detail ??
        (input.backendState.online ? "Backend online." : "Backend status pending."),
      id: "backendState",
      input: {
        active: input.backendState.active,
        available: pins.backendState,
        blocking: input.backendState.blocking,
        collapsed: true,
        warning: input.backendState.warning || !input.backendState.online,
      },
      pins,
      title: "Backend state",
    }),
    diagnostics: panelState({
      detail: input.diagnostics.detail ?? "Diagnostics available when setup or quality changes.",
      id: "diagnostics",
      input: {
        active: input.diagnostics.active,
        available: true,
        blocking: input.diagnostics.blocking,
        collapsed: true,
        warning: input.diagnostics.warning,
      },
      pins,
      title: "Diagnostics",
    }),
    exportImport: panelState({
      detail: input.exportImport.detail ?? "Portable bundle tools are available from Workspace.",
      id: "exportImport",
      input: {
        active: input.exportImport.active,
        available:
          input.exportImport.active ||
          input.exportImport.warning ||
          input.exportImport.blocking ||
          pins.exportImport,
        blocking: input.exportImport.blocking,
        hidden:
          !pins.exportImport &&
          !input.exportImport.active &&
          !input.exportImport.warning &&
          !input.exportImport.blocking,
        warning: input.exportImport.warning,
      },
      pins,
      title: "Export and import",
    }),
    sourceDetails: panelState({
      detail:
        input.sourceDetails.detail ??
        (input.sourceDetails.hasSource ? "Source context available." : "No source selected."),
      id: "sourceDetails",
      input: {
        active: input.sourceDetails.active || input.stage === "intake" || input.stage === "review",
        available: input.sourceDetails.hasSource || input.stage === "intake",
        blocking: input.sourceDetails.blocking,
        collapsed: input.sourceDetails.hasSource,
        hidden: !input.sourceDetails.hasSource && input.stage !== "intake",
        warning: input.sourceDetails.warning,
      },
      pins,
      title: "Source details",
    }),
    storage: panelState({
      detail: input.storage.detail ?? "Project storage summary is available in Workspace.",
      id: "storage",
      input: {
        available: pins.storage,
        blocking: input.storage.blocking,
        collapsed: true,
        warning: input.storage.warning,
      },
      pins,
      title: "Storage",
    }),
    voiceCloning: panelState({
      detail: input.voiceCloning.detail ?? "No source analysis is running.",
      id: "voiceCloning",
      input: voiceCloningDisclosure(input.voiceCloning),
      pins,
      title: "Voice cloning",
    }),
  };
  let attentionCount = 0;
  let highestPriorityPanel: DisclosurePanelState | null = null;
  for (const panelId of WORKSPACE_DISCLOSURE_PANEL_IDS) {
    const panel = panels[panelId];
    if (disclosureRequiresAttention(panel)) {
      attentionCount += 1;
    }
    if (
      panel.status !== "hidden" &&
      (!highestPriorityPanel ||
        disclosurePriority(panel) > disclosurePriority(highestPriorityPanel))
    ) {
      highestPriorityPanel = panel;
    }
  }
  return {
    attentionCount,
    highestPriorityPanel,
    panels,
  };
}

export function workspaceDisclosureRails(
  base: WorkspaceDisclosureRails,
  disclosure: WorkspaceDisclosureModel,
): WorkspaceDisclosureRails {
  return {
    activityFooterMode: disclosureFooterMode(base.activityFooterMode, disclosure),
    leftRailMode: disclosureRailMode(base.leftRailMode, disclosure, [
      "backendState",
      "sourceDetails",
      "storage",
    ]),
    rightRailMode: disclosureRailMode(base.rightRailMode, disclosure, [
      "audioGeneration",
      "diagnostics",
      "voiceCloning",
    ]),
  };
}

function panelState({
  detail,
  id,
  input,
  pins,
  title,
}: Readonly<{
  detail: string;
  id: WorkspaceDisclosurePanelId;
  input: DisclosureRuleInput;
  pins: WorkspaceDisclosurePins;
  title: string;
}>): DisclosurePanelState {
  const pinned = pins[id];
  return {
    detail,
    id,
    pinned,
    status: resolveDisclosureStatus({ ...input, pinned }),
    title,
  };
}

function voiceCloningDisclosure(
  input: WorkspaceDisclosureInput["voiceCloning"],
): DisclosureRuleInput {
  return {
    active: input.status === "running",
    available: input.status === "complete",
    blocking: input.blocking,
    collapsed: input.status === "idle",
    warning: input.status === "attention" || input.status === "cancelled",
  };
}

function audioGenerationDisclosure(
  input: WorkspaceDisclosureInput["audioGeneration"],
): DisclosureRuleInput {
  const warning =
    input.lifecycle === "failed" ||
    input.lifecycle === "stale" ||
    input.lifecycle === "degraded" ||
    input.lifecycle === "archived";
  return {
    active: input.lifecycle === "queued" || input.lifecycle === "generating",
    available: input.lifecycle === "ready",
    blocking: input.requiresPlayback && input.lifecycle !== "ready",
    collapsed: input.lifecycle === "missing",
    warning,
  };
}

function audioGenerationDetail(lifecycle: GeneratedAudioLifecycleState): string {
  switch (lifecycle) {
    case "archived": {
      return "Generated audio is archived.";
    }
    case "degraded": {
      return "Generated audio needs review before playback.";
    }
    case "failed": {
      return "The last generation attempt failed or was cancelled.";
    }
    case "generating": {
      return "Audio is being optimized, synthesized, or checked.";
    }
    case "queued": {
      return "Audio generation is queued.";
    }
    case "ready": {
      return "Audio is ready for playback.";
    }
    case "stale": {
      return "Audio does not match the current source, voice, policy, or scope.";
    }
    case "missing": {
      return "No generated audio exists for this source and scope yet.";
    }
  }
}

function disclosureFooterMode(
  base: ActivityFooterMode,
  disclosure: WorkspaceDisclosureModel,
): ActivityFooterMode {
  if (base === "full") {
    return base;
  }
  const footerPanels: WorkspaceDisclosurePanelId[] = [
    "audioGeneration",
    "backendState",
    "diagnostics",
    "exportImport",
    "storage",
    "voiceCloning",
  ];
  if (footerPanels.some((panelId) => shouldExpandDisclosurePanel(disclosure.panels[panelId]))) {
    return base === "collapsed" ? "compact" : base;
  }
  return base;
}

function disclosureRailMode(
  base: WorkspaceRailMode,
  disclosure: WorkspaceDisclosureModel,
  panelIds: readonly WorkspaceDisclosurePanelId[],
): WorkspaceRailMode {
  if (base === "full") {
    return base;
  }
  const shouldReveal = panelIds.some((panelId) =>
    shouldExpandDisclosurePanel(disclosure.panels[panelId]),
  );
  if (!shouldReveal) {
    return base;
  }
  return base === "collapsed" ? "compact" : base;
}
