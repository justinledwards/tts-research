import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, SegmentedControl, StatusChip, cx, fieldControlClassName } from "../../design";
import { InlineSpeechEdit } from "./InlineSpeechEdit";
import {
  REVISION_BATCH_ACTIONS,
  applyRevisionBatchAction,
  type RevisionBatchActionId,
} from "./revisionBatchActions";
import {
  createRevisionHistoryEntry,
  type RevisionHistoryContext,
  type RevisionHistoryEntry,
} from "./revisionHistory";
import {
  DEFAULT_REVISION_FILTERS,
  REVISION_POLICY_NOTE_LABELS,
  REVISION_STATUS_LABELS,
  buildRevisionFilterOptions,
  filterRevisionBlocks,
  normalizeRevisionTabId,
  revisionFiltersAreDefault,
  summarizeRevisionBlocks,
  type RevisionBlock,
  type RevisionFilterState,
  type RevisionPolicyNoteType,
  type RevisionStatus,
  type RevisionTabId,
} from "./revisionFilters";
import {
  generatedAudioStateLabel,
  sourceLifecycleDescriptor,
  type SourceLifecycleEnvelope,
} from "../source-lifecycle/sourceLifecycle";
import {
  DiagnosticList,
  formatConfidence,
  formatDurationLabel,
  newestHistoryEntries,
  RevisionEmptyState,
  RevisionFact,
  RevisionHistoryItem,
  RevisionMetric,
  RevisionStatusChip,
} from "./revisionPanelHelpers";
import { readingSurfaceClassName, readingSurfaceDataAttributes } from "../reading-surface";

export interface RevisionPanelProps {
  activeBlockId: string | null;
  blocks: RevisionBlock[];
  initialTabId?: RevisionTabId;
  policyProfileLabel: string;
  playbackToolbar?: ReactNode;
  runConfigurationLabel: string;
  scopeLabel: string;
  sourceLifecycle?: SourceLifecycleEnvelope | null;
  sourceLabel: string;
  sourceMeta: string;
  validationReason: string;
  validationSimilarity: number;
  validationTranscript: string;
  voiceProfileLabel: string;
  onActiveBlockChange: (blockId: string | null) => void;
  onInspectStructure?: () => void;
  onPreviewSpeech: () => void;
  onTabChange?: (tabId: RevisionTabId) => void;
}

export function RevisionPanel({
  activeBlockId,
  blocks,
  initialTabId = "overview",
  policyProfileLabel,
  playbackToolbar,
  runConfigurationLabel,
  scopeLabel,
  sourceLifecycle = null,
  sourceLabel,
  sourceMeta,
  validationReason,
  validationSimilarity,
  validationTranscript,
  voiceProfileLabel,
  onActiveBlockChange,
  onInspectStructure,
  onPreviewSpeech,
  onTabChange,
}: Readonly<RevisionPanelProps>) {
  const [activeTabId, setActiveTabId] = useState<RevisionTabId>(() =>
    normalizeRevisionTabId(initialTabId),
  );
  const [filters, setFilters] = useState<RevisionFilterState>(DEFAULT_REVISION_FILTERS);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
  const [statusByBlockId, setStatusByBlockId] = useState<Record<string, RevisionStatus>>({});
  const [editedTextByBlockId, setEditedTextByBlockId] = useState<Record<string, string>>({});
  const [historyEntries, setHistoryEntries] = useState<RevisionHistoryEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState("Revision workflow ready.");
  const [exportText, setExportText] = useState<string | null>(null);

  useEffect(() => {
    setActiveTabId(normalizeRevisionTabId(initialTabId));
  }, [initialTabId]);

  const blocksWithState = useMemo(
    () =>
      blocks.map((block) => ({
        ...block,
        spokenText: editedTextByBlockId[block.id] ?? block.spokenText,
        status: statusByBlockId[block.id] ?? block.status,
      })),
    [blocks, editedTextByBlockId, statusByBlockId],
  );
  useEffect(() => {
    setSelectedBlockIds((current) => {
      const allowed = new Set(blocks.map((block) => block.id));
      const next = new Set([...current].filter((blockId) => allowed.has(blockId)));
      return next.size === current.size ? current : next;
    });
  }, [blocks]);

  const filteredBlocks = useMemo(
    () => filterRevisionBlocks(blocksWithState, filters),
    [blocksWithState, filters],
  );
  const filterOptions = useMemo(
    () => buildRevisionFilterOptions(blocksWithState),
    [blocksWithState],
  );
  const summary = useMemo(() => summarizeRevisionBlocks(blocksWithState), [blocksWithState]);
  const hasActiveFilters = useMemo(() => !revisionFiltersAreDefault(filters), [filters]);
  const { activeBaseBlock, activeBlock } = selectActiveRevisionBlocks(
    blocksWithState,
    blocks,
    activeBlockId,
  );
  const lifecycleDescriptor = sourceLifecycle
    ? sourceLifecycleDescriptor(sourceLifecycle.canonicalState)
    : null;
  const context: RevisionHistoryContext = {
    policyProfile: policyProfileLabel,
    runConfiguration: runConfigurationLabel,
    voiceProfile: voiceProfileLabel,
  };
  const selectedVisibleCount = filteredBlocks.filter((block) =>
    selectedBlockIds.has(block.id),
  ).length;
  const allVisibleSelected =
    filteredBlocks.length > 0 && selectedVisibleCount === filteredBlocks.length;

  const setActiveTab = (tabId: RevisionTabId) => {
    setActiveTabId(tabId);
    onTabChange?.(tabId);
  };

  const updateFilter = <K extends keyof RevisionFilterState>(
    key: K,
    value: RevisionFilterState[K],
  ) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const toggleBlockSelection = (blockId: string, selected: boolean) => {
    setSelectedBlockIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(blockId);
      } else {
        next.delete(blockId);
      }
      return next;
    });
  };

  const toggleVisibleSelection = (selected: boolean) => {
    setSelectedBlockIds((current) => {
      const next = new Set(current);
      for (const block of filteredBlocks) {
        if (selected) {
          next.add(block.id);
        } else {
          next.delete(block.id);
        }
      }
      return next;
    });
  };

  const runBatchAction = (actionId: RevisionBatchActionId) => {
    const result = applyRevisionBatchAction({
      actionId,
      blocks: blocksWithState,
      context,
      selectedBlockIds,
      statusByBlockId,
    });
    setStatusByBlockId(result.statusByBlockId);
    setHistoryEntries((current) => [...current, ...result.historyEntries]);
    setStatusMessage(result.statusMessage);
    setExportText(result.exportText);
  };

  const saveInlineEdit = (block: RevisionBlock, nextSpokenText: string) => {
    const previousSpokenText = block.spokenText;
    setEditedTextByBlockId((current) => ({
      ...current,
      [block.id]: nextSpokenText,
    }));
    setStatusByBlockId((current) => ({
      ...current,
      [block.id]: "needsReview",
    }));
    setHistoryEntries((current) => [
      ...current,
      createRevisionHistoryEntry({
        block,
        context,
        newSpokenText: nextSpokenText,
        previousSpokenText,
        userAction: "Inline edit saved",
      }),
    ]);
    setStatusMessage(`Saved inline edit for block ${block.index.toString()}.`);
  };

  const revertInlineEdit = (block: RevisionBlock, previousSpokenText: string) => {
    setEditedTextByBlockId((current) =>
      Object.fromEntries(Object.entries(current).filter(([blockId]) => blockId !== block.id)),
    );
    setStatusByBlockId((current) => ({
      ...current,
      [block.id]: "needsReview",
    }));
    setHistoryEntries((current) => [
      ...current,
      createRevisionHistoryEntry({
        block,
        context,
        newSpokenText: previousSpokenText,
        previousSpokenText: block.spokenText,
        userAction: "Inline edit reverted",
      }),
    ]);
    setStatusMessage(`Reverted block ${block.index.toString()} to the source spoken form.`);
  };

  return (
    <section aria-label="Revision Panel" className="grid gap-3" data-testid="revision-panel">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] vs-muted">
            Revision Panel
          </p>
          <h3 className="mt-1 truncate text-lg font-semibold" title={sourceLabel}>
            {sourceLabel}
          </h3>
          <p className="mt-1 text-xs vs-muted">
            {scopeLabel} · {sourceMeta} · {runConfigurationLabel}
          </p>
          {sourceLifecycle && lifecycleDescriptor ? (
            <p className="mt-1 text-xs vs-muted">
              {lifecycleDescriptor.label} ·{" "}
              {generatedAudioStateLabel(sourceLifecycle.generatedAudioState)} ·{" "}
              {sourceLifecycle.selectedScope}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onInspectStructure ? (
            <Button
              data-testid="workspace-stage-action-inspectStructure"
              onClick={onInspectStructure}
              size="sm"
              variant="secondary"
            >
              Content Structure
            </Button>
          ) : null}
          <Button
            data-testid="workspace-stage-action-previewSpeech"
            onClick={onPreviewSpeech}
            size="sm"
            variant="primary"
          >
            Preview Speech
          </Button>
        </div>
      </div>

      <SegmentedControl
        ariaLabel="Revision tabs"
        columns={5}
        options={[
          { label: "Overview", testId: "revision-tab-overview", value: "overview" },
          { label: "Blocks", testId: "revision-tab-blocks", value: "blocks" },
          {
            label: "Pronunciation",
            testId: "revision-tab-pronunciation",
            value: "pronunciation",
          },
          { label: "Diagnostics", testId: "revision-tab-diagnostics", value: "diagnostics" },
          { label: "History", testId: "revision-tab-history", value: "history" },
        ]}
        value={activeTabId}
        onChange={setActiveTab}
      />

      <RevisionFilterBar
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        options={filterOptions}
        onFilterChange={updateFilter}
        onReset={() => {
          setFilters(DEFAULT_REVISION_FILTERS);
          setStatusMessage("Showing all revision blocks.");
        }}
      />

      <RevisionBatchBar
        allVisibleSelected={allVisibleSelected}
        selectedCount={selectedBlockIds.size}
        selectedVisibleCount={selectedVisibleCount}
        visibleCount={filteredBlocks.length}
        onBatchAction={runBatchAction}
        onClearSelection={() => {
          setSelectedBlockIds(new Set());
        }}
        onToggleVisibleSelection={toggleVisibleSelection}
      />

      {playbackToolbar ? <div className="sticky top-3 z-10">{playbackToolbar}</div> : null}

      <output
        className="rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-xs font-semibold vs-border"
        data-testid="revision-status-message"
      >
        {statusMessage}
      </output>

      {activeTabId === "overview" ? (
        <RevisionOverview
          activeBlock={activeBlock}
          policyProfileLabel={policyProfileLabel}
          scopeLabel={scopeLabel}
          summary={summary}
          voiceProfileLabel={voiceProfileLabel}
        />
      ) : null}

      {activeTabId === "blocks" ? (
        <RevisionBlocksTab
          activeBlockId={activeBlock?.id ?? null}
          blocks={filteredBlocks}
          selectedBlockIds={selectedBlockIds}
          onActiveBlockChange={onActiveBlockChange}
          onToggleBlockSelection={toggleBlockSelection}
        />
      ) : null}

      {activeTabId === "pronunciation" ? (
        <RevisionPronunciationTab blocks={filteredBlocks} />
      ) : null}

      {activeTabId === "diagnostics" ? (
        <RevisionDiagnosticsTab
          blocks={filteredBlocks}
          validationReason={validationReason}
          validationSimilarity={validationSimilarity}
          validationTranscript={validationTranscript}
        />
      ) : null}

      {activeTabId === "history" ? (
        <RevisionHistoryTab
          entries={historyEntries}
          onRevertEntry={(entry) => {
            const block = blocksWithState.find((candidate) => candidate.id === entry.blockId);
            if (block) {
              revertInlineEdit(block, entry.previousSpokenText);
            }
          }}
        />
      ) : null}

      {activeBlock && activeBaseBlock ? (
        <InlineSpeechEdit
          block={activeBlock}
          canRevert={activeBlock.spokenText !== activeBaseBlock.spokenText}
          currentSpokenText={activeBlock.spokenText}
          onRevert={() => {
            revertInlineEdit(activeBlock, activeBaseBlock.spokenText);
          }}
          onSave={(nextSpokenText) => {
            saveInlineEdit(activeBlock, nextSpokenText);
          }}
        />
      ) : null}

      {exportText ? (
        <details className="rounded-lg border bg-[var(--vs-surface)] p-3 text-xs vs-border">
          <summary className="cursor-pointer font-semibold">Latest selected export</summary>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--vs-raised)] p-3 font-mono">
            {exportText}
          </pre>
        </details>
      ) : null}
    </section>
  );
}

function selectActiveRevisionBlocks(
  blocksWithState: readonly RevisionBlock[],
  baseBlocks: readonly RevisionBlock[],
  activeBlockId: string | null,
): { activeBaseBlock: RevisionBlock | null; activeBlock: RevisionBlock | null } {
  const activeBlock =
    blocksWithState.find((block) => block.id === activeBlockId) ?? blocksWithState.at(0) ?? null;
  const activeBaseBlock = activeBlock
    ? (baseBlocks.find((block) => block.id === activeBlock.id) ?? activeBlock)
    : null;

  return { activeBaseBlock, activeBlock };
}

function RevisionFilterBar({
  filters,
  hasActiveFilters,
  options,
  onFilterChange,
  onReset,
}: Readonly<{
  filters: RevisionFilterState;
  hasActiveFilters: boolean;
  options: ReturnType<typeof buildRevisionFilterOptions>;
  onFilterChange: <K extends keyof RevisionFilterState>(
    key: K,
    value: RevisionFilterState[K],
  ) => void;
  onReset: () => void;
}>) {
  return (
    <div className="grid gap-2 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
      <div className="grid gap-2 lg:grid-cols-[minmax(12rem,1.2fr)_repeat(5,minmax(8rem,1fr))_auto]">
        <label className="grid gap-1 text-xs font-semibold">
          Search blocks
          <input
            className={fieldControlClassName}
            data-testid="revision-filter-search"
            onChange={(event) => {
              onFilterChange("search", event.target.value);
            }}
            placeholder="Text, policy note, warning"
            value={filters.search}
          />
        </label>
        <RevisionSelect
          label="Status"
          testId="revision-filter-status"
          value={filters.status}
          onChange={(value) => {
            onFilterChange("status", value as RevisionFilterState["status"]);
          }}
        >
          <option value="all">All statuses</option>
          {options.statuses.map((status) => (
            <option key={status} value={status}>
              {REVISION_STATUS_LABELS[status]}
            </option>
          ))}
        </RevisionSelect>
        <RevisionSelect
          label="Section"
          testId="revision-filter-section"
          value={filters.sourceSection}
          onChange={(value) => {
            onFilterChange("sourceSection", value);
          }}
        >
          <option value="all">All sections</option>
          {options.sourceSections.map((section) => (
            <option key={section} value={section}>
              {section}
            </option>
          ))}
        </RevisionSelect>
        <RevisionSelect
          label="Policy note"
          testId="revision-filter-policy-note"
          value={filters.policyNoteType}
          onChange={(value) => {
            onFilterChange(
              "policyNoteType",
              value === "all" ? "all" : (value as RevisionPolicyNoteType),
            );
          }}
        >
          <option value="all">All notes</option>
          {options.policyNoteTypes.map((type) => (
            <option key={type} value={type}>
              {REVISION_POLICY_NOTE_LABELS[type]}
            </option>
          ))}
        </RevisionSelect>
        <RevisionSelect
          label="Confidence"
          testId="revision-filter-confidence"
          value={filters.confidence}
          onChange={(value) => {
            onFilterChange("confidence", value as RevisionFilterState["confidence"]);
          }}
        >
          <option value="all">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </RevisionSelect>
        <RevisionSelect
          label="Attention"
          testId="revision-filter-attention"
          value={filters.needsAttention}
          onChange={(value) => {
            onFilterChange("needsAttention", value as RevisionFilterState["needsAttention"]);
          }}
        >
          <option value="all">All blocks</option>
          <option value="yes">Needs attention</option>
          <option value="no">No attention flag</option>
        </RevisionSelect>
        {hasActiveFilters ? (
          <div className="flex items-end">
            <Button data-testid="ui-action-revision-filter-reset" onClick={onReset} size="sm">
              Show all
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RevisionSelect({
  children,
  label,
  onChange,
  testId,
  value,
}: Readonly<{
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      {label}
      <select
        className={fieldControlClassName}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function RevisionBatchBar({
  allVisibleSelected,
  selectedCount,
  selectedVisibleCount,
  visibleCount,
  onBatchAction,
  onClearSelection,
  onToggleVisibleSelection,
}: Readonly<{
  allVisibleSelected: boolean;
  selectedCount: number;
  selectedVisibleCount: number;
  visibleCount: number;
  onBatchAction: (actionId: RevisionBatchActionId) => void;
  onClearSelection: () => void;
  onToggleVisibleSelection: (selected: boolean) => void;
}>) {
  const hasSelection = selectedCount > 0;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
      <label className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-[var(--vs-raised)] px-3 text-sm font-semibold vs-border">
        <input
          checked={allVisibleSelected}
          className="h-4 w-4"
          data-testid="revision-select-visible"
          onChange={(event) => {
            onToggleVisibleSelection(event.target.checked);
          }}
          type="checkbox"
        />
        Select visible ({selectedVisibleCount.toString()}/{visibleCount.toString()})
      </label>
      <Button
        data-testid="ui-action-revision-clear-selection"
        disabled={!hasSelection}
        disabledReason={hasSelection ? undefined : "Select blocks before clearing selection."}
        onClick={onClearSelection}
        size="sm"
        variant="secondary"
      >
        Clear selection
      </Button>
      <span className="text-xs font-semibold vs-muted">{selectedCount.toString()} selected</span>
      {REVISION_BATCH_ACTIONS.map((action) => (
        <Button
          data-testid={action.testId}
          disabled={!hasSelection}
          disabledReason={hasSelection ? undefined : "Select one or more blocks first."}
          key={action.actionId}
          onClick={() => {
            onBatchAction(action.actionId);
          }}
          size="sm"
          variant="secondary"
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function RevisionOverview({
  activeBlock,
  policyProfileLabel,
  scopeLabel,
  summary,
  voiceProfileLabel,
}: Readonly<{
  activeBlock: RevisionBlock | null;
  policyProfileLabel: string;
  scopeLabel: string;
  summary: ReturnType<typeof summarizeRevisionBlocks>;
  voiceProfileLabel: string;
}>) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <RevisionMetric label="Blocks" value={summary.total.toLocaleString()} />
        <RevisionMetric label="Needs attention" value={summary.needsAttention.toLocaleString()} />
        <RevisionMetric label="Approved" value={summary.approved.toLocaleString()} />
        <RevisionMetric label="Estimate" value={formatDurationLabel(summary.estimatedDurationMs)} />
        <RevisionMetric label="Confidence" value={formatConfidence(summary.averageConfidence)} />
      </div>
      <div className="grid gap-2 rounded-lg border bg-[var(--vs-surface)] p-3 text-sm vs-border">
        <dl className="grid gap-2 sm:grid-cols-3">
          <RevisionFact label="Scope" value={scopeLabel} />
          <RevisionFact label="Policy" value={policyProfileLabel} />
          <RevisionFact label="Voice" value={voiceProfileLabel} />
        </dl>
        {activeBlock ? (
          <div
            className="rounded-md bg-[var(--vs-raised)] p-3"
            {...readingSurfaceDataAttributes({ active: true, kind: "source" })}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Active block {activeBlock.index.toString()}</p>
              <RevisionStatusChip status={activeBlock.status} />
              <StatusChip tone={activeBlock.needsAttention ? "warning" : "neutral"}>
                {activeBlock.needsAttention ? "Needs attention" : "No attention flag"}
              </StatusChip>
            </div>
            <p className={`mt-2 line-clamp-3 ${readingSurfaceClassName("source")}`}>
              {activeBlock.text}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RevisionBlocksTab({
  activeBlockId,
  blocks,
  selectedBlockIds,
  onActiveBlockChange,
  onToggleBlockSelection,
}: Readonly<{
  activeBlockId: string | null;
  blocks: RevisionBlock[];
  selectedBlockIds: ReadonlySet<string>;
  onActiveBlockChange: (blockId: string | null) => void;
  onToggleBlockSelection: (blockId: string, selected: boolean) => void;
}>) {
  if (blocks.length === 0) {
    return <RevisionEmptyState detail="No blocks match the current search and filters." />;
  }
  return (
    <div
      className="max-h-[32rem] overflow-auto rounded-lg border vs-border"
      data-testid="revision-block-list"
    >
      {blocks.map((block) => (
        <div
          className={cx(
            "grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-2 border-b bg-[var(--vs-raised)] p-3 last:border-b-0 vs-border",
            activeBlockId === block.id && "bg-[var(--vs-selected)]",
          )}
          key={block.id}
        >
          <label className="flex min-h-11 items-start justify-center pt-3">
            <input
              aria-label={`Select block ${block.index.toString()}`}
              checked={selectedBlockIds.has(block.id)}
              className="h-4 w-4"
              data-testid={`revision-select-block-${block.id}`}
              onChange={(event) => {
                onToggleBlockSelection(block.id, event.target.checked);
              }}
              type="checkbox"
            />
          </label>
          <Button
            align="start"
            className="min-w-0 border-transparent bg-transparent p-0 shadow-none hover:bg-transparent"
            data-testid={`revision-block-${block.id}`}
            onClick={() => {
              onActiveBlockChange(block.id);
            }}
            selected={activeBlockId === block.id}
            variant="ghost"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold" title={block.label}>
                {block.index.toString()}. {block.label}
              </span>
              <span
                className={`mt-1 block line-clamp-2 ${readingSurfaceClassName("source")}`}
                {...readingSurfaceDataAttributes({ kind: "source" })}
              >
                {block.text}
              </span>
              <span className="mt-2 block text-xs vs-muted">
                {block.sourceSection} · {block.segmentCount.toString()} segment
                {block.segmentCount === 1 ? "" : "s"} ·{" "}
                {formatDurationLabel(block.estimatedDurationMs)}
              </span>
            </span>
          </Button>
          <div className="flex flex-col items-end gap-2">
            <RevisionStatusChip status={block.status} />
            <StatusChip tone={block.needsAttention ? "warning" : "neutral"}>
              {formatConfidence(block.confidence)}
            </StatusChip>
          </div>
        </div>
      ))}
    </div>
  );
}

function RevisionPronunciationTab({ blocks }: Readonly<{ blocks: RevisionBlock[] }>) {
  const pronunciationBlocks = blocks.filter(
    (block) => block.pronunciationCount > 0 || block.normalisationCount > 0,
  );
  if (pronunciationBlocks.length === 0) {
    return (
      <RevisionEmptyState detail="No pronunciation or normalization decisions match the current filters." />
    );
  }
  return (
    <div className="grid gap-2">
      {pronunciationBlocks.map((block) => (
        <div className="rounded-lg border bg-[var(--vs-surface)] p-3 vs-border" key={block.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {block.index.toString()}. {block.label}
            </p>
            <div className="flex flex-wrap gap-2">
              <StatusChip tone="info">
                {block.pronunciationCount.toString()} pronunciations
              </StatusChip>
              <StatusChip tone="neutral">
                {block.normalisationCount.toString()} normalizations
              </StatusChip>
            </div>
          </div>
          <p
            className={`mt-2 ${readingSurfaceClassName("spoken")}`}
            {...readingSurfaceDataAttributes({
              active: block.status === "needsReview",
              kind: "spoken",
            })}
          >
            {block.spokenText}
          </p>
        </div>
      ))}
    </div>
  );
}

function RevisionDiagnosticsTab({
  blocks,
  validationReason,
  validationSimilarity,
  validationTranscript,
}: Readonly<{
  blocks: RevisionBlock[];
  validationReason: string;
  validationSimilarity: number;
  validationTranscript: string;
}>) {
  const warnings = blocks.flatMap((block) =>
    block.warnings.map((warning) => ({
      block,
      warning,
    })),
  );
  const lowConfidenceBlocks = blocks.filter(
    (block) =>
      typeof block.confidence === "number" && block.confidence > 0 && block.confidence < 0.74,
  );
  return (
    <div className="grid gap-3">
      <div className="rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Validation Transcript</p>
          <StatusChip tone={validationSimilarity > 0 ? "success" : "neutral"}>
            {formatConfidence(validationSimilarity || null)} match
          </StatusChip>
        </div>
        <p className="mt-2 text-sm leading-6 vs-muted">{validationReason}</p>
        {validationTranscript ? (
          <p className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-[var(--vs-raised)] p-3 font-mono text-xs leading-5 vs-border">
            {validationTranscript}
          </p>
        ) : null}
      </div>
      <DiagnosticList
        emptyText="No warnings match the current filters."
        items={warnings.map(({ block, warning }) => ({
          detail: warning,
          id: `${block.id}-${warning}`,
          label: `Block ${block.index.toString()} · ${block.label}`,
        }))}
        title="Warnings"
      />
      <DiagnosticList
        emptyText="No low-confidence blocks match the current filters."
        items={lowConfidenceBlocks.map((block) => ({
          detail: `${formatConfidence(block.confidence)} · ${block.policyNote}`,
          id: block.id,
          label: `Block ${block.index.toString()} · ${block.label}`,
        }))}
        title="Low Confidence"
      />
      <DiagnosticList
        emptyText="No policy notes match the current filters."
        items={blocks.map((block) => ({
          detail: block.policyNote,
          id: block.id,
          label: `${REVISION_POLICY_NOTE_LABELS[block.policyNoteType]} · ${block.label}`,
        }))}
        title="Policy Notes"
      />
    </div>
  );
}

function RevisionHistoryTab({
  entries,
  onRevertEntry,
}: Readonly<{
  entries: RevisionHistoryEntry[];
  onRevertEntry: (entry: RevisionHistoryEntry) => void;
}>) {
  if (entries.length === 0) {
    return (
      <RevisionEmptyState detail="No revision history yet. Inline edits and batch actions appear here." />
    );
  }
  return (
    <div className="grid gap-2">
      {newestHistoryEntries(entries).map((entry) => (
        <RevisionHistoryItem entry={entry} key={entry.id} onRevertEntry={onRevertEntry} />
      ))}
    </div>
  );
}
