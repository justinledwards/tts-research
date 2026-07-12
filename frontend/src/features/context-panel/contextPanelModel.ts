import type { ReactNode } from "react";
import {
  CONTEXT_PANEL_TAB_IDS,
  CONTEXT_PANEL_TAB_META,
  type ContextPanelTabId,
} from "./contextPanelTabs";

export type ContextPanelSurface =
  | "BookCinema"
  | "DocumentCinema"
  | "WebsiteCinema"
  | "Workspace"
  | "Review"
  | "Teleprompt";

export type ContextPanelOwner = "cinema" | "context-panel" | "review" | "teleprompt" | "workspace";

export type ContextPanelRelevancePredicate =
  | "always"
  | "requires-active-block"
  | "requires-diagnostics"
  | "requires-generated-audio"
  | "requires-generation-queue"
  | "requires-import-confidence"
  | "requires-policy"
  | "requires-source"
  | "requires-voice"
  | "requires-wayfinding";

export type ContextPanelDisplayState = "collapsed" | "expanded" | "pinned";

export type ContextPanelSectionPriority = "advanced" | "critical" | "primary" | "secondary";

export type ContextPanelSectionKind =
  | "alignment-repair"
  | "current-passage"
  | "extraction-health"
  | "generation-queue"
  | "generated-audio-health"
  | "highlight-confidence"
  | "import-confidence"
  | "narration-block-status"
  | "policy-notes"
  | "skipped-content"
  | "source-provenance"
  | "speech-policy"
  | "timing-map"
  | "temporary-diagnostics"
  | "temporary-history"
  | "temporary-promotion"
  | "temporary-review-status"
  | "temporary-source-policy"
  | "temporary-source-provenance"
  | "voice-profile"
  | "wayfinding";

export interface ContextPanelSection {
  allowedSurfaces?: readonly ContextPanelSurface[];
  children: ReactNode;
  debugOnly?: boolean;
  detail: string;
  emptyState?: string;
  id: string;
  kind: ContextPanelSectionKind;
  owner?: ContextPanelOwner;
  panelId?: ContextPanelTabId;
  priority?: ContextPanelSectionPriority;
  relevance?: ContextPanelRelevancePredicate;
  title: string;
}

export interface ContextPanelSectionInput {
  readonly allowedSurfaces?: readonly ContextPanelSurface[];
  readonly children: ReactNode;
  readonly debugOnly?: boolean;
  readonly detail: string;
  readonly emptyState?: string;
  readonly id: string;
  readonly kind: ContextPanelSectionKind;
  readonly owner?: ContextPanelOwner;
  readonly priority?: ContextPanelSectionPriority;
  readonly relevance?: ContextPanelRelevancePredicate;
  readonly tabId: ContextPanelTabId;
  readonly title: string;
}

export interface ContextPanelBuildOptions {
  readonly allowedSurfaces?: readonly ContextPanelSurface[];
  readonly owner?: ContextPanelOwner;
}

export interface ContextPanelTabDefinition {
  advanced?: boolean;
  detail: string;
  id: ContextPanelTabId;
  sections: ContextPanelSection[];
  title: string;
}

export type ContextPanelFocusMode = "debug" | "inspect" | "read" | "review";

export function normalizeContextPanelTabId(
  value: unknown,
  fallback: ContextPanelTabId = "overview",
): ContextPanelTabId {
  return CONTEXT_PANEL_TAB_IDS.includes(value as ContextPanelTabId)
    ? (value as ContextPanelTabId)
    : fallback;
}

export function contextPanelDefaultTabForFocusMode(
  mode: ContextPanelFocusMode,
): ContextPanelTabId | null {
  if (mode === "inspect") {
    return "overview";
  }
  if (mode === "review") {
    return "review";
  }
  if (mode === "debug") {
    return "diagnostics";
  }
  return null;
}

export function buildContextPanelTabs(
  sections: readonly ContextPanelSectionInput[],
  options: ContextPanelBuildOptions = {},
): ContextPanelTabDefinition[] {
  const sectionsByTab = new Map<ContextPanelTabId, ContextPanelSection[]>();
  for (const section of sections) {
    const existing = sectionsByTab.get(section.tabId) ?? [];
    const meta = CONTEXT_PANEL_TAB_META[section.tabId];
    existing.push({
      allowedSurfaces:
        section.allowedSurfaces ??
        options.allowedSurfaces ??
        allowedSurfacesForOwner(section.owner ?? options.owner ?? "context-panel"),
      children: section.children,
      debugOnly: section.debugOnly ?? section.tabId === "diagnostics",
      detail: section.detail,
      emptyState: section.emptyState ?? meta.emptyState,
      id: section.id,
      kind: section.kind,
      owner: section.owner ?? options.owner ?? ownerForSectionId(section.id),
      panelId: section.tabId,
      priority: section.priority ?? priorityForSection(section),
      relevance: section.relevance ?? relevanceForSectionKind(section.kind),
      title: section.title,
    });
    sectionsByTab.set(section.tabId, existing);
  }

  return CONTEXT_PANEL_TAB_IDS.flatMap((tabId) => {
    const tabSections = sectionsByTab.get(tabId) ?? [];
    if (tabSections.length === 0) {
      return [];
    }
    const meta = CONTEXT_PANEL_TAB_META[tabId];
    return [
      {
        advanced: meta.advanced,
        detail: meta.detail,
        id: tabId,
        sections: sortContextPanelSections(tabSections),
        title: meta.label,
      },
    ];
  });
}

export function selectContextPanelTab(
  tabs: readonly ContextPanelTabDefinition[],
  requestedTabId: ContextPanelTabId | null | undefined,
  preferredTabId?: ContextPanelTabId | null,
): ContextPanelTabDefinition | null {
  if (requestedTabId) {
    const requested = tabs.find((tab) => tab.id === requestedTabId);
    if (requested) {
      return requested;
    }
  }
  if (preferredTabId) {
    const preferred = tabs.find((tab) => tab.id === preferredTabId);
    if (preferred) {
      return preferred;
    }
  }
  return tabs[0] ?? null;
}

function allowedSurfacesForOwner(owner: ContextPanelOwner): readonly ContextPanelSurface[] {
  if (owner === "cinema") {
    return ["BookCinema", "DocumentCinema", "WebsiteCinema"];
  }
  if (owner === "review") {
    return ["Review"];
  }
  if (owner === "teleprompt") {
    return ["Teleprompt"];
  }
  if (owner === "workspace") {
    return ["Workspace"];
  }
  return ["BookCinema", "DocumentCinema", "WebsiteCinema", "Workspace", "Review", "Teleprompt"];
}

function ownerForSectionId(id: string): ContextPanelOwner {
  if (id.startsWith("review-")) {
    return "review";
  }
  if (id.startsWith("teleprompt-")) {
    return "teleprompt";
  }
  if (id.startsWith("workspace-")) {
    return "workspace";
  }
  return "context-panel";
}

function relevanceForSectionKind(kind: ContextPanelSectionKind): ContextPanelRelevancePredicate {
  switch (kind) {
    case "current-passage":
    case "narration-block-status": {
      return "requires-active-block";
    }
    case "alignment-repair":
    case "extraction-health":
    case "highlight-confidence":
    case "timing-map": {
      return "requires-diagnostics";
    }
    case "generation-queue": {
      return "requires-generation-queue";
    }
    case "generated-audio-health": {
      return "requires-generated-audio";
    }
    case "import-confidence": {
      return "requires-import-confidence";
    }
    case "policy-notes":
    case "speech-policy": {
      return "requires-policy";
    }
    case "source-provenance":
    case "temporary-source-provenance":
    case "skipped-content": {
      return "requires-source";
    }
    case "temporary-diagnostics": {
      return "requires-diagnostics";
    }
    case "temporary-history": {
      return "requires-wayfinding";
    }
    case "temporary-promotion":
    case "temporary-source-policy": {
      return "requires-policy";
    }
    case "temporary-review-status": {
      return "requires-active-block";
    }
    case "voice-profile": {
      return "requires-voice";
    }
    case "wayfinding": {
      return "requires-wayfinding";
    }
  }
  const exhaustive: never = kind;
  return exhaustive;
}

const CONTEXT_PANEL_PRIORITY_RANK: Record<ContextPanelSectionPriority, number> = {
  critical: 0,
  primary: 1,
  secondary: 2,
  advanced: 3,
};

export function compareContextPanelSectionPriority(
  left: ContextPanelSection,
  right: ContextPanelSection,
): number {
  return (
    CONTEXT_PANEL_PRIORITY_RANK[left.priority ?? "secondary"] -
    CONTEXT_PANEL_PRIORITY_RANK[right.priority ?? "secondary"]
  );
}

function sortContextPanelSections(sections: readonly ContextPanelSection[]): ContextPanelSection[] {
  const sorted: ContextPanelSection[] = [];
  for (const section of sections) {
    const insertionIndex = sorted.findIndex(
      (candidate) => compareContextPanelSectionPriority(section, candidate) < 0,
    );
    if (insertionIndex === -1) {
      sorted.push(section);
    } else {
      sorted.splice(insertionIndex, 0, section);
    }
  }
  return sorted;
}

function priorityForSection(section: ContextPanelSectionInput): ContextPanelSectionPriority {
  if (section.tabId === "diagnostics" || section.debugOnly) {
    return "advanced";
  }
  if (
    section.kind === "generated-audio-health" ||
    section.kind === "generation-queue" ||
    section.kind === "narration-block-status"
  ) {
    return "primary";
  }
  if (
    section.kind === "source-provenance" ||
    section.kind === "temporary-source-provenance" ||
    section.kind === "current-passage"
  ) {
    return "primary";
  }
  return "secondary";
}
