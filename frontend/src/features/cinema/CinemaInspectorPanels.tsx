import type { ReactNode } from "react";
import { StatusChip } from "../../design";
import {
  ReaderWayfindingPanel,
  type ReaderBookmarkItem,
  type ReaderOutlineItem,
  type ReaderRecentPositionItem,
} from "../reader-navigation";
import { TEMPORARY_SOURCE_COPY } from "../temporary-source-copy";
import { buildContextPanelTabs, type ContextPanelSectionKind } from "../context-panel";
import {
  readAlongRuntimeDebugRows,
  readAlongRuntimeStateLabel,
  readAlongRuntimeStatusClassName,
  readAlongInvariantDebugRows,
  readAlongInvariantStatusLabel,
  SyncDebugOverlay,
  type AlignmentRepairContext,
  type AlignmentRepairMap,
  type SyncDebugSnapshot,
  type ReadAlongRuntimeSnapshot,
  type ReadAlongInvariantReport,
} from "../readalong";
import type { CinemaTemporarySourceContract } from "./cinemaTemporarySource";
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

export interface CinemaTemporaryInspectorModel {
  artifactCount: number;
  audioStatus: string;
  bookmarkCount: number;
  contract: CinemaTemporarySourceContract;
  diagnostics?: readonly string[];
  originLabel: string;
  policyLabel: string;
  promotionItems: readonly string[];
  pronunciationCount?: number;
  recentPositionCount: number;
  repairNotes?: readonly string[];
  reviewEditCount: number;
  skippedCount: number;
  sourceTypeLabel: string;
  timingConfidence: string;
  title: string;
  warnings?: readonly string[];
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

export function buildCinemaTemporaryInspectorSections(
  model: CinemaTemporaryInspectorModel,
): CinemaInspectorSection[] {
  if (!model.contract.isTemporary) {
    return [];
  }
  return [
    buildCinemaInspectorSection({
      children: (
        <TemporaryFacts
          facts={[
            ["Ownership", model.contract.ownershipLabel],
            ["Source type", model.sourceTypeLabel],
            ["Title", model.title],
            ["Origin", model.originLabel],
            ["Provenance", model.contract.provenanceLabel],
            ["Session", model.contract.temporarySourceId ?? "Temporary session"],
            ["Expiry policy", TEMPORARY_SOURCE_COPY.terms.expiresAfterInactivity],
            ["Expiry", model.contract.expiryLabel],
            ["Status", model.contract.statusLabel],
            ["Artifacts", artifactCountLabel(model.artifactCount)],
          ]}
          notes={model.warnings?.map((warning) => ["Warning", warning])}
        />
      ),
      detail: `${model.contract.ownershipLabel} · ${model.contract.expiryLabel}`,
      id: "temporary-source-provenance",
      kind: "temporary-source-provenance",
      modeAffinity: "inspect",
      tabId: "overview",
      title: "Temporary source",
    }),
    buildCinemaInspectorSection({
      children: (
        <TemporaryFacts
          emptyText={
            model.reviewEditCount === 0 && (model.repairNotes?.length ?? 0) === 0
              ? "No review edits or repair notes exist for this temporary source yet."
              : undefined
          }
          facts={[
            ["Block status", temporaryReviewStatusLabel(model.reviewEditCount)],
            ["Review scope", TEMPORARY_SOURCE_COPY.terms.sessionOnlyReviewNote],
            ["Review edits", model.reviewEditCount.toLocaleString()],
            ["Repair notes", (model.repairNotes?.length ?? 0).toLocaleString()],
            ["Warnings", (model.warnings?.length ?? 0).toLocaleString()],
            ["Pronunciation", `${(model.pronunciationCount ?? 0).toLocaleString()} overrides`],
          ]}
          notes={[
            ...(model.repairNotes ?? []).map((note): [string, string] => ["Repair", note]),
            ...(model.warnings ?? []).map((warning): [string, string] => ["Warning", warning]),
          ]}
        />
      ),
      detail: temporaryReviewStatusLabel(model.reviewEditCount),
      id: "temporary-review-status",
      kind: "temporary-review-status",
      modeAffinity: "review",
      tabId: "review",
      title: "Temporary review",
    }),
    buildCinemaInspectorSection({
      children: (
        <TemporaryFacts
          emptyText={
            model.audioStatus === "No generated audio" &&
            model.skippedCount === 0 &&
            model.timingConfidence === "No timing map"
              ? "No generated audio, skipped content, timing map, or extraction diagnostic exists yet."
              : undefined
          }
          facts={[
            ["Extraction", diagnosticsLabel(model.diagnostics)],
            ["Skipped content", model.skippedCount.toLocaleString()],
            ["Audio", model.audioStatus],
            ["Timing", model.timingConfidence],
            ["Promotion boundary", "No local cache paths are included"],
          ]}
          notes={model.diagnostics?.map((diagnostic) => ["Diagnostic", diagnostic])}
        />
      ),
      detail: `${model.audioStatus} · ${model.timingConfidence}`,
      id: "temporary-diagnostics",
      kind: "temporary-diagnostics",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Temporary diagnostics",
    }),
    buildCinemaInspectorSection({
      children: (
        <TemporaryFacts
          facts={[
            ["Session policy", model.policyLabel],
            ["Source pin preview", TEMPORARY_SOURCE_COPY.promotion.sourcePin],
            ["Temporary policy", "Applies only while this session exists"],
            ["Promotion defaults", "Project defaults are considered only when keeping the source"],
          ]}
        />
      ),
      detail: model.policyLabel,
      id: "temporary-source-policy",
      kind: "temporary-source-policy",
      modeAffinity: ["inspect", "review"],
      tabId: "policy",
      title: "Temporary policy",
    }),
    buildCinemaInspectorSection({
      children: (
        <TemporaryFacts
          emptyText={
            model.bookmarkCount === 0 && model.recentPositionCount === 0
              ? "No temporary bookmarks or recent positions exist for this session yet."
              : undefined
          }
          facts={[
            ["Bookmarks", model.bookmarkCount.toLocaleString()],
            ["Recent positions", model.recentPositionCount.toLocaleString()],
            ["History scope", "Temporary session only"],
            ["Return context", model.contract.temporarySourceId ?? "Current temporary source"],
          ]}
        />
      ),
      detail: `${model.bookmarkCount.toLocaleString()} bookmarks · temporary only`,
      id: "temporary-history",
      kind: "temporary-history",
      modeAffinity: "review",
      tabId: "history",
      title: "Temporary history",
    }),
    buildCinemaInspectorSection({
      children: (
        <TemporaryFacts
          emptyText={
            model.promotionItems.length === 0
              ? "Only the extracted source is ready to keep. Optional artifacts appear here after they exist."
              : undefined
          }
          facts={[
            ["Action", TEMPORARY_SOURCE_COPY.terms.keepInProject],
            ["Keeps", "A durable project copy"],
            ["Promotion status", model.contract.statusLabel],
            ["Temporary session", "Remains temporary until discarded or expired"],
            ["Discard action", TEMPORARY_SOURCE_COPY.terms.discardTemporarySource],
            ["Available artifacts", promotionItemsLabel(model.promotionItems)],
          ]}
          notes={model.promotionItems.map((item) => ["Can keep", item])}
        />
      ),
      detail: promotionItemsLabel(model.promotionItems),
      id: "temporary-promotion",
      kind: "temporary-promotion",
      modeAffinity: ["inspect", "review"],
      tabId: "policy",
      title: "Promotion",
    }),
  ];
}

export function buildCinemaInspectorSection(
  section: CinemaInspectorSection,
): CinemaInspectorSection {
  return section;
}

export function ReadAlongInvariantDebugPanel({
  onRepairMapChange,
  report,
  repairContext,
  repairMap,
  runtime,
  syncDebugSnapshot,
}: Readonly<{
  onRepairMapChange?: (map: AlignmentRepairMap | null) => void;
  report: ReadAlongInvariantReport;
  repairContext?: AlignmentRepairContext;
  repairMap?: AlignmentRepairMap | null;
  runtime?: ReadAlongRuntimeSnapshot | null;
  syncDebugSnapshot?: SyncDebugSnapshot | null;
}>) {
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
          {syncDebugSnapshot ? (
            <SyncDebugOverlay
              onRepairMapChange={onRepairMapChange}
              repairContext={repairContext}
              repairMap={repairMap}
              snapshot={syncDebugSnapshot}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function readAlongStatusClassName(report: ReadAlongInvariantReport): string {
  if (report.status === "failed") {
    return "text-[var(--vs-action-primary)]";
  }
  if (report.status === "degraded") {
    return "text-[var(--vs-status-warning)]";
  }
  return "text-[var(--vs-status-success)]";
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

function TemporaryFacts({
  emptyText,
  facts,
  notes = [],
}: Readonly<{
  emptyText?: string;
  facts: readonly (readonly [string, string])[];
  notes?: readonly (readonly [string, string])[];
}>) {
  let supportingContent: ReactNode = null;
  if (notes.length > 0) {
    supportingContent = (
      <div className="grid gap-2">
        {notes.map(([label, value], index) => (
          <p
            className="rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs leading-5 vs-border"
            key={`${label}:${index.toString()}:${value}`}
          >
            <span className="font-semibold">{label}: </span>
            {value}
          </p>
        ))}
      </div>
    );
  } else if (emptyText) {
    supportingContent = (
      <p className="rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs leading-5 vs-muted vs-border">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="grid gap-3 text-sm">
      <dl className="grid gap-2">
        {facts.map(([label, value]) => (
          <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-2" key={label}>
            <dt className="vs-muted">{label}</dt>
            <dd className="min-w-0 break-words font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {supportingContent}
      <div className="flex flex-wrap gap-2">
        <StatusChip tone="metadata">Temporary source</StatusChip>
      </div>
    </div>
  );
}

function artifactCountLabel(count: number): string {
  return count === 1 ? "1 artifact" : `${count.toLocaleString()} artifacts`;
}

function temporaryReviewStatusLabel(reviewEditCount: number): string {
  return reviewEditCount > 0
    ? `${reviewEditCount.toLocaleString()} review edits`
    : "No review edits";
}

function diagnosticsLabel(diagnostics?: readonly string[]): string {
  return diagnostics && diagnostics.length > 0 ? `${diagnostics.length.toString()} notes` : "None";
}

function promotionItemsLabel(items: readonly string[]): string {
  return items.length > 0 ? items.join(", ") : TEMPORARY_SOURCE_COPY.promotion.extractedSource;
}
