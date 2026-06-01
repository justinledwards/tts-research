import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Button,
  SegmentedControl,
  StatusChip,
  cx,
  fieldControlClassName,
  type StatusChipTone,
} from "../../design";
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
  REVISION_TRIAGE_DESCRIPTIONS,
  REVISION_TRIAGE_LABELS,
  buildRevisionFilterOptions,
  buildRevisionTriageItems,
  filterRevisionBlocks,
  groupRevisionTriageItems,
  normalizeRevisionTabId,
  revisionBlockHasPolicyTransform,
  revisionBlockIsSkipped,
  revisionBlockTriageCategory,
  revisionFiltersAreDefault,
  revisionNextActionLabel,
  revisionPreviewReadinessLabel,
  summarizeRevisionHealth,
  type RevisionBlock,
  type RevisionFilterState,
  type RevisionHealthSummary,
  type RevisionPolicyNoteType,
  type RevisionStatus,
  type RevisionTabId,
  type RevisionTriageCategory,
  type RevisionTriageGroup,
  type RevisionTriageItem,
} from "./revisionFilters";
import {
  generatedAudioStateLabel,
  sourceLifecycleDescriptor,
  type SourceLifecycleEnvelope,
} from "../source-lifecycle/sourceLifecycle";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  resolveShortcutCommandBinding,
  shortcutAriaKeyShortcutsForCommand,
  shortcutTooltip,
  shouldIgnoreNarrationShortcutTarget,
  type ShortcutCommandId,
  type ShortcutPreferences,
} from "../shortcuts/shortcutRegistry";
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
  baseBlocks?: RevisionBlock[];
  blocks: RevisionBlock[];
  historyEntries: RevisionHistoryEntry[];
  initialTabId?: RevisionTabId;
  policyProfileLabel: string;
  playbackToolbar?: ReactNode;
  runConfigurationLabel: string;
  scopeLabel: string;
  sourceLifecycle?: SourceLifecycleEnvelope | null;
  sourceLabel: string;
  sourceMeta: string;
  statusByBlockId: Record<string, RevisionStatus>;
  shortcutPreferences?: ShortcutPreferences;
  validationReason: string;
  validationSimilarity: number;
  validationTranscript: string;
  voiceProfileLabel: string;
  onActiveBlockChange: (blockId: string | null) => void;
  onEditedTextByBlockIdChange: Dispatch<SetStateAction<Record<string, string>>>;
  onHistoryEntriesChange: Dispatch<SetStateAction<RevisionHistoryEntry[]>>;
  onInspectStructure?: () => void;
  onPreviewSpeech: () => void;
  onStatusByBlockIdChange: Dispatch<SetStateAction<Record<string, RevisionStatus>>>;
  onTabChange?: (tabId: RevisionTabId) => void;
}

export function RevisionPanel({
  activeBlockId,
  baseBlocks,
  blocks,
  historyEntries,
  initialTabId = "overview",
  policyProfileLabel,
  playbackToolbar,
  runConfigurationLabel,
  scopeLabel,
  sourceLifecycle = null,
  sourceLabel,
  sourceMeta,
  statusByBlockId,
  shortcutPreferences = DEFAULT_SHORTCUT_PREFERENCES,
  validationReason,
  validationSimilarity,
  validationTranscript,
  voiceProfileLabel,
  onActiveBlockChange,
  onEditedTextByBlockIdChange,
  onHistoryEntriesChange,
  onInspectStructure,
  onPreviewSpeech,
  onStatusByBlockIdChange,
  onTabChange,
}: Readonly<RevisionPanelProps>) {
  const [activeTabId, setActiveTabId] = useState<RevisionTabId>(() =>
    normalizeRevisionTabId(initialTabId),
  );
  const [filters, setFilters] = useState<RevisionFilterState>(DEFAULT_REVISION_FILTERS);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
  const [dirtyDraftByBlockId, setDirtyDraftByBlockId] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState("Revision workflow ready.");
  const [exportText, setExportText] = useState<string | null>(null);

  useEffect(() => {
    setActiveTabId(normalizeRevisionTabId(initialTabId));
  }, [initialTabId]);

  const blocksWithState = blocks;
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
  const summary = useMemo(() => summarizeRevisionHealth(blocksWithState), [blocksWithState]);
  const triageGroups = useMemo(
    () => groupRevisionTriageItems(buildRevisionTriageItems(filteredBlocks)),
    [filteredBlocks],
  );
  const hasActiveFilters = useMemo(() => !revisionFiltersAreDefault(filters), [filters]);
  const { activeBaseBlock, activeBlock } = selectActiveRevisionBlocks(
    blocksWithState,
    baseBlocks ?? blocks,
    activeBlockId,
  );
  const lifecycleDescriptor = sourceLifecycle
    ? sourceLifecycleDescriptor(sourceLifecycle.canonicalState)
    : null;
  const context: RevisionHistoryContext = useMemo(
    () => ({
      policyProfile: policyProfileLabel,
      runConfiguration: runConfigurationLabel,
      voiceProfile: voiceProfileLabel,
    }),
    [policyProfileLabel, runConfigurationLabel, voiceProfileLabel],
  );
  const selectedVisibleCount = filteredBlocks.filter((block) =>
    selectedBlockIds.has(block.id),
  ).length;
  const allVisibleSelected =
    filteredBlocks.length > 0 && selectedVisibleCount === filteredBlocks.length;
  const activeDraftDirty = Boolean(activeBlock && dirtyDraftByBlockId[activeBlock.id]);

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
    if (actionId === "approveSelected" && activeDraftDirty) {
      setStatusMessage("Save or discard the inline edit before approving blocks.");
      return;
    }
    const result = applyRevisionBatchAction({
      actionId,
      blocks: blocksWithState,
      context,
      selectedBlockIds,
      statusByBlockId,
    });
    onStatusByBlockIdChange(result.statusByBlockId);
    onHistoryEntriesChange((current) => [...current, ...result.historyEntries]);
    setStatusMessage(result.statusMessage);
    setExportText(result.exportText);
  };

  const saveInlineEdit = (block: RevisionBlock, nextSpokenText: string) => {
    const previousSpokenText = block.spokenText;
    onEditedTextByBlockIdChange((current) => ({
      ...current,
      [block.id]: nextSpokenText,
    }));
    onStatusByBlockIdChange((current) => ({
      ...current,
      [block.id]: "needsReview",
    }));
    onHistoryEntriesChange((current) => [
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
    onEditedTextByBlockIdChange((current) =>
      Object.fromEntries(Object.entries(current).filter(([blockId]) => blockId !== block.id)),
    );
    onStatusByBlockIdChange((current) => ({
      ...current,
      [block.id]: "needsReview",
    }));
    onHistoryEntriesChange((current) => [
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

  const setBlockStatus = useCallback(
    (block: RevisionBlock, status: RevisionStatus, userAction: string) => {
      onStatusByBlockIdChange((current) => ({
        ...current,
        [block.id]: status,
      }));
      onHistoryEntriesChange((current) => [
        ...current,
        createRevisionHistoryEntry({
          block,
          context,
          newSpokenText: block.spokenText,
          previousSpokenText: block.spokenText,
          userAction,
        }),
      ]);
      setStatusMessage(
        `Block ${block.index.toString()} set to ${REVISION_STATUS_LABELS[status].toLowerCase()}.`,
      );
    },
    [context, onHistoryEntriesChange, onStatusByBlockIdChange],
  );

  const focusInlineEditor = useCallback(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="revision-inline-edit-textarea"]',
    );
    textarea?.focus();
    textarea?.scrollIntoView({ block: "center", behavior: "auto" });
    if (activeBlock) {
      setStatusMessage(`Editing block ${activeBlock.index.toString()}.`);
    }
  }, [activeBlock]);

  const runReviewShortcut = useCallback(
    (commandId: ShortcutCommandId) => {
      if (!activeBlock) {
        setStatusMessage("Select a block before using review shortcuts.");
        return;
      }
      if (commandId === "review.approve") {
        const canApprove = !activeDraftDirty && activeBlock.spokenText.trim().length > 0;
        const disabledReason = revisionApprovalDisabledReason(canApprove, activeDraftDirty);
        if (disabledReason) {
          setStatusMessage(disabledReason);
          return;
        }
        setBlockStatus(activeBlock, "approved", "Block approved");
        return;
      }
      if (commandId === "review.edit") {
        focusInlineEditor();
        return;
      }
      if (commandId === "review.inspector") {
        if (onInspectStructure) {
          onInspectStructure();
        } else {
          setStatusMessage("Source structure is unavailable for this review source.");
        }
        return;
      }
      if (commandId === "review.regenerate") {
        setBlockStatus(activeBlock, "regenerating", "Regeneration requested");
        return;
      }
      if (commandId === "review.retry") {
        setBlockStatus(activeBlock, "retrying", "Retry requested");
      }
    },
    [activeBlock, activeDraftDirty, focusInlineEditor, onInspectStructure, setBlockStatus],
  );

  const handleDraftStateChange = useCallback((blockId: string, dirty: boolean) => {
    setDirtyDraftByBlockId((current) => {
      if (current[blockId] === dirty) {
        return current;
      }
      return {
        ...current,
        [blockId]: dirty,
      };
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreNarrationShortcutTarget(event.target)) {
        return;
      }
      const resolved = resolveShortcutCommandBinding(event, shortcutPreferences, "review");
      if (
        !resolved ||
        ![
          "review.approve",
          "review.edit",
          "review.inspector",
          "review.regenerate",
          "review.retry",
        ].includes(resolved.commandId)
      ) {
        return;
      }
      event.preventDefault();
      runReviewShortcut(resolved.commandId);
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [runReviewShortcut, shortcutPreferences]);

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
              {...revisionShortcutButtonProps(
                "review.inspector",
                "Content Structure",
                shortcutPreferences,
              )}
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

      <RevisionHealthBanner summary={summary} onPreviewSpeech={onPreviewSpeech} />

      <output
        className="rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-xs font-semibold vs-border"
        data-testid="revision-status-message"
      >
        {statusMessage}
      </output>

      <div className="grid gap-3 2xl:grid-cols-[minmax(18rem,0.95fr)_minmax(0,1.45fr)] 2xl:items-start">
        <div className="grid gap-3">
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
            approveDisabledReason={
              activeDraftDirty ? "Save or discard the inline edit before approving." : undefined
            }
            selectedCount={selectedBlockIds.size}
            selectedVisibleCount={selectedVisibleCount}
            visibleCount={filteredBlocks.length}
            onBatchAction={runBatchAction}
            onClearSelection={() => {
              setSelectedBlockIds(new Set());
            }}
            onToggleVisibleSelection={toggleVisibleSelection}
          />

          <RevisionRepairQueue
            activeBlockId={activeBlock?.id ?? null}
            groups={triageGroups}
            selectedBlockIds={selectedBlockIds}
            onActiveBlockChange={onActiveBlockChange}
            onToggleBlockSelection={toggleBlockSelection}
          />
        </div>

        <div className="grid gap-3">
          {playbackToolbar ? <div className="sticky top-3 z-10">{playbackToolbar}</div> : null}
          <RevisionSelectedBlockEditor
            activeBaseBlock={activeBaseBlock}
            activeBlock={activeBlock}
            activeDraftDirty={activeDraftDirty}
            activeTabId={activeTabId}
            blocks={filteredBlocks}
            historyEntries={historyEntries}
            policyProfileLabel={policyProfileLabel}
            scopeLabel={scopeLabel}
            shortcutPreferences={shortcutPreferences}
            summary={summary}
            validationReason={validationReason}
            validationSimilarity={validationSimilarity}
            validationTranscript={validationTranscript}
            voiceProfileLabel={voiceProfileLabel}
            onDraftStateChange={handleDraftStateChange}
            onInlineEditRevert={revertInlineEdit}
            onInlineEditSave={saveInlineEdit}
            onPreviewSpeech={() => {
              if (activeBlock) {
                onActiveBlockChange(activeBlock.id);
              }
              onPreviewSpeech();
            }}
            onRevertHistoryEntry={(entry) => {
              const block = blocksWithState.find((candidate) => candidate.id === entry.blockId);
              if (block) {
                revertInlineEdit(block, entry.previousSpokenText);
              }
            }}
            onSetActiveTab={setActiveTab}
            onSetBlockStatus={setBlockStatus}
          />
        </div>
      </div>

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
  approveDisabledReason,
  selectedCount,
  selectedVisibleCount,
  visibleCount,
  onBatchAction,
  onClearSelection,
  onToggleVisibleSelection,
}: Readonly<{
  allVisibleSelected: boolean;
  approveDisabledReason?: string;
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
      {REVISION_BATCH_ACTIONS.map((action) => {
        const actionDisabledReason = revisionBatchActionDisabledReason(
          action.actionId,
          hasSelection,
          approveDisabledReason,
        );
        return (
          <Button
            data-testid={action.testId}
            disabled={Boolean(actionDisabledReason)}
            disabledReason={actionDisabledReason}
            key={action.actionId}
            onClick={() => {
              onBatchAction(action.actionId);
            }}
            size="sm"
            variant="secondary"
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

function revisionBatchActionDisabledReason(
  actionId: RevisionBatchActionId,
  hasSelection: boolean,
  approveDisabledReason?: string,
): string | undefined {
  if (hasSelection) {
    return actionId === "approveSelected" ? approveDisabledReason : undefined;
  }
  return "Select one or more blocks first.";
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
  summary: RevisionHealthSummary;
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

function RevisionHealthBanner({
  summary,
  onPreviewSpeech,
}: Readonly<{ summary: RevisionHealthSummary; onPreviewSpeech: () => void }>) {
  const readinessTone = summary.previewReadiness === "ready" ? "success" : "warning";
  return (
    <div className="grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Review health</p>
            <StatusChip tone={readinessTone}>{revisionPreviewReadinessLabel(summary)}</StatusChip>
          </div>
          <p className="mt-1 text-sm vs-muted">
            Next action: {revisionNextActionLabel(summary)}. Preview Speech stays available while
            warnings are resolved.
          </p>
        </div>
        <Button
          data-testid="workspace-stage-action-previewSpeech-selected"
          onClick={onPreviewSpeech}
          size="sm"
          variant={summary.previewReadiness === "ready" ? "primary" : "soft"}
        >
          Preview Speech
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        <RevisionHealthStat label="Ready" value={summary.ready.toLocaleString()} />
        <RevisionHealthStat label="Needs repair" value={summary.needsRepair.toLocaleString()} />
        <RevisionHealthStat
          label="Pronunciation"
          value={summary.pronunciationItems.toLocaleString()}
        />
        <RevisionHealthStat label="Skipped" value={summary.skipped.toLocaleString()} />
        <RevisionHealthStat label="Policy" value={summary.policyTransforms.toLocaleString()} />
        <RevisionHealthStat label="Approved" value={summary.approved.toLocaleString()} />
        <RevisionHealthStat label="Warnings" value={summary.previewWarnings.toLocaleString()} />
      </div>
    </div>
  );
}

function RevisionHealthStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--vs-raised)] px-3 py-2">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function RevisionRepairQueue({
  activeBlockId,
  groups,
  selectedBlockIds,
  onActiveBlockChange,
  onToggleBlockSelection,
}: Readonly<{
  activeBlockId: string | null;
  groups: RevisionTriageGroup[];
  selectedBlockIds: ReadonlySet<string>;
  onActiveBlockChange: (blockId: string | null) => void;
  onToggleBlockSelection: (blockId: string, selected: boolean) => void;
}>) {
  if (groups.length === 0) {
    return <RevisionEmptyState detail="No blocks match the current search and filters." />;
  }
  return (
    <div
      className="max-h-[42rem] overflow-auto rounded-lg border bg-[var(--vs-surface)] vs-border"
      data-testid="revision-block-list"
    >
      {groups.map((group) => (
        <section className="border-b last:border-b-0 vs-border" key={group.category}>
          <div className="sticky top-0 z-10 border-b bg-[var(--vs-surface)] px-3 py-2 vs-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{REVISION_TRIAGE_LABELS[group.category]}</p>
              <StatusChip tone={triageTone(group.category)}>
                {group.items.length.toLocaleString()}
              </StatusChip>
            </div>
            <p className="mt-1 text-xs vs-muted">{REVISION_TRIAGE_DESCRIPTIONS[group.category]}</p>
          </div>
          {group.items.map((item) => (
            <RevisionRepairQueueRow
              active={activeBlockId === item.block.id}
              item={item}
              key={item.block.id}
              selected={selectedBlockIds.has(item.block.id)}
              onActiveBlockChange={onActiveBlockChange}
              onToggleBlockSelection={onToggleBlockSelection}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function RevisionRepairQueueRow({
  active,
  item,
  selected,
  onActiveBlockChange,
  onToggleBlockSelection,
}: Readonly<{
  active: boolean;
  item: RevisionTriageItem;
  selected: boolean;
  onActiveBlockChange: (blockId: string | null) => void;
  onToggleBlockSelection: (blockId: string, selected: boolean) => void;
}>) {
  const { block } = item;
  return (
    <div
      className={cx(
        "grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-2 border-b bg-[var(--vs-raised)] p-3 last:border-b-0 vs-border",
        active && "bg-[var(--vs-selected)]",
      )}
    >
      <label className="flex min-h-11 items-start justify-center pt-3">
        <input
          aria-label={`Select block ${block.index.toString()}`}
          checked={selected}
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
        selected={active}
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
            {item.reason} · {block.sourceSection} · {formatDurationLabel(block.estimatedDurationMs)}
          </span>
        </span>
      </Button>
      <div className="flex flex-col items-end gap-2">
        <RevisionStatusChip status={block.status} />
        <StatusChip tone={triageTone(item.category)}>
          {formatConfidence(block.confidence)}
        </StatusChip>
      </div>
    </div>
  );
}

function RevisionSelectedBlockEditor({
  activeBaseBlock,
  activeBlock,
  activeDraftDirty,
  activeTabId,
  blocks,
  historyEntries,
  policyProfileLabel,
  scopeLabel,
  shortcutPreferences,
  summary,
  validationReason,
  validationSimilarity,
  validationTranscript,
  voiceProfileLabel,
  onDraftStateChange,
  onInlineEditRevert,
  onInlineEditSave,
  onPreviewSpeech,
  onRevertHistoryEntry,
  onSetActiveTab,
  onSetBlockStatus,
}: Readonly<{
  activeBaseBlock: RevisionBlock | null;
  activeBlock: RevisionBlock | null;
  activeDraftDirty: boolean;
  activeTabId: RevisionTabId;
  blocks: RevisionBlock[];
  historyEntries: RevisionHistoryEntry[];
  policyProfileLabel: string;
  scopeLabel: string;
  shortcutPreferences: ShortcutPreferences;
  summary: RevisionHealthSummary;
  validationReason: string;
  validationSimilarity: number;
  validationTranscript: string;
  voiceProfileLabel: string;
  onDraftStateChange: (blockId: string, dirty: boolean) => void;
  onInlineEditRevert: (block: RevisionBlock, previousSpokenText: string) => void;
  onInlineEditSave: (block: RevisionBlock, nextSpokenText: string) => void;
  onPreviewSpeech: () => void;
  onRevertHistoryEntry: (entry: RevisionHistoryEntry) => void;
  onSetActiveTab: (tabId: RevisionTabId) => void;
  onSetBlockStatus: (block: RevisionBlock, status: RevisionStatus, userAction: string) => void;
}>) {
  if (!activeBlock || !activeBaseBlock) {
    return <RevisionEmptyState detail="Select a block from the repair queue to review it." />;
  }

  const canApprove = !activeDraftDirty && activeBlock.spokenText.trim().length > 0;
  const approveDisabledReason = revisionApprovalDisabledReason(canApprove, activeDraftDirty);
  const approveShortcut = revisionShortcutButtonProps(
    "review.approve",
    "Approve",
    shortcutPreferences,
    approveDisabledReason,
  );
  const editShortcut = revisionShortcutButtonProps(
    "review.edit",
    "Edit current block",
    shortcutPreferences,
  );
  const retryShortcut = revisionShortcutButtonProps("review.retry", "Retry", shortcutPreferences);
  const regenerateShortcut = revisionShortcutButtonProps(
    "review.regenerate",
    "Regenerate",
    shortcutPreferences,
  );

  return (
    <section
      aria-label={`Selected block editor for ${activeBlock.label}`}
      className="grid gap-3"
      data-testid="revision-selected-block-editor"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] vs-muted">
            Selected Block Editor
          </p>
          <h4 className="mt-1 truncate text-lg font-semibold" title={activeBlock.label}>
            {activeBlock.index.toString()}. {activeBlock.label}
          </h4>
          <p className="mt-1 text-xs vs-muted">
            {activeBlock.sourceSection} · {activeBlock.kind} ·{" "}
            {formatDurationLabel(activeBlock.estimatedDurationMs)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RevisionStatusChip status={activeBlock.status} />
          <StatusChip tone={triageTone(revisionBlockTriageCategory(activeBlock))}>
            {REVISION_TRIAGE_LABELS[revisionBlockTriageCategory(activeBlock)]}
          </StatusChip>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          {...approveShortcut}
          data-testid="ui-action-revision-block-approve"
          disabled={!canApprove}
          disabledReason={approveDisabledReason}
          onClick={() => {
            onSetBlockStatus(activeBlock, "approved", "Block approved");
          }}
          size="sm"
          variant="primary"
        >
          Approve
        </Button>
        <Button
          {...editShortcut}
          data-testid="ui-action-revision-block-edit-focus"
          data-ui-focus-target="revision-inline-edit-textarea"
          onClick={() => {
            document
              .querySelector<HTMLTextAreaElement>('[data-testid="revision-inline-edit-textarea"]')
              ?.focus();
          }}
          size="sm"
          variant="secondary"
        >
          Edit
        </Button>
        <Button
          data-testid="ui-action-revision-block-preview"
          onClick={onPreviewSpeech}
          size="sm"
          variant="soft"
        >
          Preview Speech
        </Button>
        <Button
          data-testid="ui-action-revision-block-needs-review"
          onClick={() => {
            onSetBlockStatus(activeBlock, "needsReview", "Marked needs review");
          }}
          size="sm"
          variant="secondary"
        >
          Mark needs review
        </Button>
        <Button
          data-testid="ui-action-revision-block-skip"
          onClick={() => {
            onSetBlockStatus(activeBlock, "skipped", "Block skipped");
          }}
          size="sm"
          variant="secondary"
        >
          Skip
        </Button>
        <Button
          {...retryShortcut}
          data-testid="ui-action-revision-block-retry"
          onClick={() => {
            onSetBlockStatus(activeBlock, "retrying", "Retry requested");
          }}
          size="sm"
          variant="secondary"
        >
          Retry
        </Button>
        <Button
          {...regenerateShortcut}
          data-testid="ui-action-revision-block-regenerate"
          onClick={() => {
            onSetBlockStatus(activeBlock, "regenerating", "Regeneration requested");
          }}
          size="sm"
          variant="secondary"
        >
          Regenerate
        </Button>
      </div>

      <RevisionSourceSpokenSurface block={activeBlock} />

      <RevisionPronunciationRepair
        block={activeBlock}
        onRepair={() => {
          onSetBlockStatus(activeBlock, "needsReview", "Pronunciation repair started");
        }}
      />

      <InlineSpeechEdit
        block={activeBlock}
        canRevert={activeBlock.spokenText !== activeBaseBlock.spokenText}
        currentSpokenText={activeBlock.spokenText}
        onDraftStateChange={onDraftStateChange}
        onRevert={() => {
          onInlineEditRevert(activeBlock, activeBaseBlock.spokenText);
        }}
        onSave={(nextSpokenText) => {
          onInlineEditSave(activeBlock, nextSpokenText);
        }}
      />

      <div className="grid gap-3">
        <SegmentedControl
          ariaLabel="Revision details"
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
          onChange={onSetActiveTab}
        />

        {activeTabId === "overview" ? (
          <RevisionOverview
            activeBlock={activeBlock}
            policyProfileLabel={policyProfileLabel}
            scopeLabel={scopeLabel}
            summary={summary}
            voiceProfileLabel={voiceProfileLabel}
          />
        ) : null}
        {activeTabId === "blocks" ? <RevisionSelectedBlockFacts block={activeBlock} /> : null}
        {activeTabId === "pronunciation" ? <RevisionPronunciationTab blocks={blocks} /> : null}
        {activeTabId === "diagnostics" ? (
          <RevisionDiagnosticsTab
            blocks={blocks}
            validationReason={validationReason}
            validationSimilarity={validationSimilarity}
            validationTranscript={validationTranscript}
          />
        ) : null}
        {activeTabId === "history" ? (
          <RevisionHistoryTab entries={historyEntries} onRevertEntry={onRevertHistoryEntry} />
        ) : null}
      </div>
    </section>
  );
}

function revisionApprovalDisabledReason(
  canApprove: boolean,
  activeDraftDirty: boolean,
): string | undefined {
  if (canApprove) {
    return undefined;
  }
  if (activeDraftDirty) {
    return "Save or discard the inline edit before approving.";
  }
  return "A block needs spoken text before approval.";
}

function revisionShortcutButtonProps(
  commandId: ShortcutCommandId,
  label: string,
  preferences: ShortcutPreferences,
  disabledReason?: string,
) {
  return {
    "aria-keyshortcuts": shortcutAriaKeyShortcutsForCommand(commandId, preferences),
    "data-shortcut-command-id": commandId,
    title: shortcutTooltip(label, commandId, preferences, disabledReason),
  };
}

function RevisionSelectedBlockFacts({ block }: Readonly<{ block: RevisionBlock }>) {
  return (
    <div className="grid gap-3">
      <dl className="grid gap-3 sm:grid-cols-3">
        <RevisionFact label="Segments" value={block.segmentCount.toLocaleString()} />
        <RevisionFact label="Confidence" value={formatConfidence(block.confidence)} />
        <RevisionFact label="Policy" value={REVISION_POLICY_NOTE_LABELS[block.policyNoteType]} />
      </dl>
      <DiagnosticList
        emptyText="No warnings on this block."
        items={block.warnings.map((warning, index) => ({
          detail: warning,
          id: `${block.id}-warning-${index.toString()}`,
          label: `Block ${block.index.toString()}`,
        }))}
        title="Selected Block Warnings"
      />
      <DiagnosticList
        emptyText="No policy note for this block."
        items={[
          {
            detail: block.policyNote,
            id: `${block.id}-policy`,
            label: REVISION_POLICY_NOTE_LABELS[block.policyNoteType],
          },
        ].filter((item) => item.detail.trim().length > 0)}
        title="Selected Block Policy"
      />
    </div>
  );
}

function RevisionSourceSpokenSurface({ block }: Readonly<{ block: RevisionBlock }>) {
  const shouldCompare =
    block.text.trim() !== block.spokenText.trim() ||
    revisionBlockIsSkipped(block) ||
    revisionBlockHasPolicyTransform(block) ||
    block.pronunciationCount + block.normalisationCount > 0;
  if (!shouldCompare) {
    return (
      <RevisionReadingPane
        label="Spoken form"
        surfaceKind="spoken"
        value={block.spokenText || "No spoken text."}
      />
    );
  }
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <RevisionReadingPane label="Source text" surfaceKind="source" value={block.text} />
      <RevisionReadingPane
        label={revisionBlockIsSkipped(block) ? "Skipped spoken form" : "Spoken form"}
        surfaceKind="spoken"
        value={block.spokenText || "No spoken text."}
      />
    </div>
  );
}

function RevisionReadingPane({
  label,
  surfaceKind,
  value,
}: Readonly<{ label: string; surfaceKind: "source" | "spoken"; value: string }>) {
  return (
    <div className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 vs-border">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p
        className={`mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words ${readingSurfaceClassName(
          surfaceKind,
        )}`}
        {...readingSurfaceDataAttributes({ kind: surfaceKind })}
      >
        {value}
      </p>
    </div>
  );
}

function RevisionPronunciationRepair({
  block,
  onRepair,
}: Readonly<{ block: RevisionBlock; onRepair: () => void }>) {
  const pronunciations = block.pronunciations ?? [];
  const normalisations = block.normalisations ?? [];
  if (pronunciations.length === 0 && normalisations.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-2 rounded-lg border bg-[var(--vs-raised)] p-3 vs-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Pronunciation Repair</p>
        <Button
          data-testid="ui-action-revision-pronunciation-repair"
          onClick={onRepair}
          size="sm"
          variant="secondary"
        >
          Edit spoken form
        </Button>
      </div>
      <div className="grid gap-2">
        {pronunciations.map((decision, index) => (
          <RevisionRepairDecision
            key={`${decision.entryId ?? decision.term}-${index.toString()}`}
            label={decision.term || decision.originalText}
            meta={decision.scope ?? decision.source}
            spoken={decision.spoken}
          />
        ))}
        {normalisations.map((decision, index) => (
          <RevisionRepairDecision
            key={`${decision.kind}-${decision.startOffset.toString()}-${index.toString()}`}
            label={decision.original}
            meta={decision.rule || decision.kind}
            spoken={decision.spoken}
          />
        ))}
      </div>
    </div>
  );
}

function RevisionRepairDecision({
  label,
  meta,
  spoken,
}: Readonly<{ label: string; meta: string; spoken: string }>) {
  return (
    <div className="grid gap-1 rounded-md border bg-[var(--vs-surface)] p-3 text-sm vs-border">
      <p className="font-semibold">
        {label} {" -> "} {spoken}
      </p>
      <p className="text-xs vs-muted">{meta}</p>
    </div>
  );
}

function triageTone(category: RevisionTriageCategory): StatusChipTone {
  switch (category) {
    case "audioBlocker": {
      return "danger";
    }
    case "pronunciation":
    case "questionable": {
      return "warning";
    }
    case "policyTransform": {
      return "info";
    }
    case "clean": {
      return "success";
    }
    case "skipped": {
      return "neutral";
    }
  }
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
