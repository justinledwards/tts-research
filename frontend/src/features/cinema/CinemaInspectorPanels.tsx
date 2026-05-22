import type { ReactNode } from "react";
import {
  ReaderWayfindingPanel,
  type ReaderBookmarkItem,
  type ReaderOutlineItem,
  type ReaderRecentPositionItem,
} from "../reader-navigation";
import { buildContextPanelTabs, type ContextPanelSectionKind } from "../context-panel";
import type { CinemaFocusMode, CinemaInspectorPanelId, CinemaPanelDefinition } from "./model";

export interface CinemaCurrentReading {
  action?: ReactNode;
  detail: string;
  emptyText: string;
  excerpt: string;
  label: string;
  metadata?: ReactNode;
}

export interface CinemaWayfindingModel<TOutlineTarget = unknown> {
  bookmarks: ReaderBookmarkItem[];
  canBookmark: boolean;
  maxItems?: number;
  outlineItems: ReaderOutlineItem<TOutlineTarget>[];
  recentItems: ReaderRecentPositionItem[];
  onAddBookmark: () => void;
  onBookmarkNavigate: (bookmark: ReaderBookmarkItem) => void;
  onOutlineNavigate: (item: ReaderOutlineItem<TOutlineTarget>) => void;
  onRecentNavigate: (item: ReaderRecentPositionItem) => void;
}

export interface CinemaInspectorSection {
  children: ReactNode;
  detail: string;
  id: string;
  kind: ContextPanelSectionKind;
  modeAffinity: CinemaFocusMode | readonly CinemaFocusMode[];
  tabId: CinemaInspectorPanelId;
  title: string;
}

export function buildCinemaCurrentReadingSection(
  reading: CinemaCurrentReading,
): CinemaInspectorSection {
  return buildCinemaInspectorSection({
    children: (
      <div className="grid gap-3">
        <p className="text-sm font-semibold">{reading.label}</p>
        <p className="text-xs vs-muted">{reading.detail}</p>
        {reading.metadata}
        <p className="line-clamp-5 text-sm leading-6">{reading.excerpt || reading.emptyText}</p>
        {reading.action}
      </div>
    ),
    detail: reading.detail,
    id: "current-passage",
    kind: "current-passage",
    modeAffinity: ["inspect", "review"],
    tabId: "overview",
    title: "Current passage",
  });
}

export function buildCinemaWayfindingSection<TOutlineTarget>(
  wayfinding: CinemaWayfindingModel<TOutlineTarget>,
): CinemaInspectorSection {
  return buildCinemaInspectorSection({
    children: (
      <ReaderWayfindingPanel
        bookmarks={wayfinding.bookmarks}
        canBookmark={wayfinding.canBookmark}
        className="border-0 bg-transparent p-0 shadow-none"
        maxItems={wayfinding.maxItems ?? 7}
        outlineItems={wayfinding.outlineItems}
        recentItems={wayfinding.recentItems}
        onAddBookmark={wayfinding.onAddBookmark}
        onBookmarkNavigate={wayfinding.onBookmarkNavigate}
        onOutlineNavigate={wayfinding.onOutlineNavigate}
        onRecentNavigate={wayfinding.onRecentNavigate}
      />
    ),
    detail: "Outline, bookmarks, recent",
    id: "wayfinding",
    kind: "wayfinding",
    modeAffinity: "review",
    tabId: "history",
    title: "Wayfinding",
  });
}

export function buildCinemaInspectorSection(
  section: CinemaInspectorSection,
): CinemaInspectorSection {
  return section;
}

export function buildCinemaInspectorPanels(
  sections: readonly CinemaInspectorSection[],
): CinemaPanelDefinition[] {
  return buildContextPanelTabs(
    sections.map((section) => ({
      children: section.children,
      detail: section.detail,
      id: section.id,
      kind: section.kind,
      tabId: section.tabId,
      title: section.title,
    })),
    {
      allowedSurfaces: ["BookCinema", "DocumentCinema", "WebsiteCinema"],
      owner: "cinema",
    },
  ).map((tab) => ({
    ...tab,
    modeAffinity: mergeModeAffinities(
      sections.filter((section) => section.tabId === tab.id).map((section) => section.modeAffinity),
    ),
  }));
}

function mergeModeAffinities(
  affinities: readonly (CinemaFocusMode | readonly CinemaFocusMode[])[],
): CinemaFocusMode[] {
  const modes = new Set<CinemaFocusMode>();
  for (const affinity of affinities) {
    const items: readonly CinemaFocusMode[] = Array.isArray(affinity) ? affinity : [affinity];
    for (const mode of items) {
      modes.add(mode);
    }
  }
  return [...modes];
}
