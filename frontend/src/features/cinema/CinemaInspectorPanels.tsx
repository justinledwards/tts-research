import type { ReactNode } from "react";
import {
  ReaderWayfindingPanel,
  type ReaderBookmarkItem,
  type ReaderOutlineItem,
  type ReaderRecentPositionItem,
} from "../reader-navigation";
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
  id: CinemaInspectorPanelId;
  modeAffinity: CinemaFocusMode | readonly CinemaFocusMode[];
  title: string;
}

export function buildCinemaCurrentReadingPanel(
  reading: CinemaCurrentReading,
): CinemaPanelDefinition {
  return buildCinemaInspectorPanel({
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
    id: "current",
    modeAffinity: ["inspect", "review"],
    title: "Current passage",
  });
}

export function buildCinemaWayfindingPanel<TOutlineTarget>(
  wayfinding: CinemaWayfindingModel<TOutlineTarget>,
): CinemaPanelDefinition {
  return buildCinemaInspectorPanel({
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
    modeAffinity: "review",
    title: "Wayfinding",
  });
}

export function buildCinemaInspectorPanel(section: CinemaInspectorSection): CinemaPanelDefinition {
  return {
    children: section.children,
    detail: section.detail,
    id: section.id,
    modeAffinity: section.modeAffinity,
    title: section.title,
  };
}

export function buildCinemaInspectorPanels(
  sections: readonly CinemaInspectorSection[],
): CinemaPanelDefinition[] {
  return sections.map((section) => buildCinemaInspectorPanel(section));
}
