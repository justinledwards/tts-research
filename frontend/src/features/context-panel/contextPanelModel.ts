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

export type ContextPanelSectionKind =
  | "current-passage"
  | "extraction-health"
  | "generated-audio-health"
  | "highlight-confidence"
  | "narration-block-status"
  | "policy-notes"
  | "skipped-content"
  | "source-provenance"
  | "speech-policy"
  | "timing-map"
  | "wayfinding";

export interface ContextPanelSection {
  children: ReactNode;
  detail: string;
  id: string;
  kind: ContextPanelSectionKind;
  title: string;
}

export interface ContextPanelSectionInput extends ContextPanelSection {
  tabId: ContextPanelTabId;
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
): ContextPanelTabDefinition[] {
  const sectionsByTab = new Map<ContextPanelTabId, ContextPanelSection[]>();
  for (const section of sections) {
    const existing = sectionsByTab.get(section.tabId) ?? [];
    existing.push({
      children: section.children,
      detail: section.detail,
      id: section.id,
      kind: section.kind,
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
        sections: tabSections,
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
