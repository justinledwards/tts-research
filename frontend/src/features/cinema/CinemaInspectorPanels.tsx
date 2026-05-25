import type { ReactNode } from "react";
import {
  ReaderWayfindingPanel,
  type ReaderBookmarkItem,
  type ReaderOutlineItem,
  type ReaderRecentPositionItem,
} from "../reader-navigation";
import { buildContextPanelTabs, type ContextPanelSectionKind } from "../context-panel";
import {
  readAlongRuntimeDebugRows,
  readAlongRuntimeStateLabel,
  readAlongRuntimeStatusClassName,
  readAlongInvariantDebugRows,
  readAlongInvariantStatusLabel,
  type ReadAlongRuntimeSnapshot,
  type ReadAlongInvariantReport,
} from "../readalong";
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

export function ReadAlongInvariantDebugPanel({
  report,
  runtime,
}: Readonly<{ report: ReadAlongInvariantReport; runtime?: ReadAlongRuntimeSnapshot | null }>) {
  const rows = readAlongInvariantDebugRows(report);
  const runtimeRows = readAlongRuntimeDebugRows(runtime);
  return (
    <div className="mt-4 rounded-lg border p-4 text-xs vs-border">
      <div className="flex items-center justify-between gap-3">
        <p className="vs-muted font-semibold uppercase tracking-[0.2em]">Read-along</p>
        <span className={`font-semibold ${readAlongStatusClassName(report)}`}>
          {readAlongInvariantStatusLabel(report)}
        </span>
      </div>
      <p className="mt-2 leading-5 vs-muted">{report.summary}</p>
      <dl className="mt-3 grid gap-2">
        {rows.map((row) => (
          <div className="grid gap-1" key={`${row.label}:${row.value}`}>
            <dt className="font-semibold text-[var(--vs-text)]">{row.label}</dt>
            <dd className="leading-5 vs-muted">{row.value}</dd>
          </div>
        ))}
      </dl>
      {runtime ? (
        <div className="mt-4 border-t pt-3 vs-border">
          <div className="flex items-center justify-between gap-3">
            <p className="vs-muted font-semibold uppercase tracking-[0.2em]">Runtime sync</p>
            <span className={`font-semibold ${readAlongRuntimeStatusClassName(runtime)}`}>
              {readAlongRuntimeStateLabel(runtime)}
            </span>
          </div>
          <p className="mt-2 leading-5 vs-muted">{runtime.reason}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            {runtimeRows.map((row) => (
              <div className="contents" key={`${row.label}:${row.value}`}>
                <dt className="vs-muted">{row.label}</dt>
                <dd className="truncate text-right">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function readAlongStatusClassName(report: ReadAlongInvariantReport): string {
  if (report.status === "failed") {
    return "text-orange-500";
  }
  if (report.status === "degraded") {
    return "text-amber-500";
  }
  return "text-emerald-500";
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
