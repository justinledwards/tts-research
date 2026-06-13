import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type Ref,
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
  applyRevisionSpokenRepair,
  buildRevisionFilterOptions,
  buildRevisionTriageItems,
  firstRevisionRepairBlockId,
  filterRevisionBlocks,
  groupRevisionTriageItems,
  normalizeRevisionTabId,
  revisionBlockIsCleanApprovable,
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
  reviewBlocksForMode,
  reviewModeLabel,
  type ReviewMode,
  type ReviewOpenFocusRequest,
  type TemporaryReviewStateAdapter,
} from "../review/model";
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
  shouldIgnoreNarrationShortcutEvent,
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
  onDiscardTemporarySource?: () => void;
  policyProfileLabel: string;
  playbackToolbar?: ReactNode;
  reviewMode?: ReviewMode;
  reviewOpenFocusRequest?: ReviewOpenFocusRequest | null;
  runConfigurationLabel: string;
  scopeLabel: string;
  sourceLifecycle?: SourceLifecycleEnvelope | null;
  sourceLabel: string;
  sourceMeta: string;
  statusByBlockId: Record<string, RevisionStatus>;
  shortcutPreferences?: ShortcutPreferences;
  temporaryReview?: TemporaryReviewStateAdapter | null;
  validationReason: string;
  validationSimilarity: number;
  validationTranscript: string;
  voiceProfileLabel: string;
  onActiveBlockChange: (blockId: string | null) => void;
  onEditedTextByBlockIdChange: Dispatch<SetStateAction<Record<string, string>>>;
  onHistoryEntriesChange: Dispatch<SetStateAction<RevisionHistoryEntry[]>>;
  onInspectStructure?: () => void;
  keepTemporarySourceDisabledReason?: string;
  onKeepTemporarySource?: () => void;
  onNextIssue?: () => void;
  onPreviewSpeech: () => void;
  onReviewModeChange?: (mode: ReviewMode) => void;
  onStatusByBlockIdChange: Dispatch<SetStateAction<Record<string, RevisionStatus>>>;
  onTabChange?: (tabId: RevisionTabId) => void;
}

function temporaryReviewKeepDisabledReason(
  handler: (() => void) | undefined,
  flagDisabledReason: string | undefined,
): string | undefined {
  if (flagDisabledReason) {
    return flagDisabledReason;
  }
  return handler ? undefined : "This temporary source cannot be kept in project yet.";
}

export function RevisionPanel({
  activeBlockId,
  baseBlocks,
  blocks,
  historyEntries,
  initialTabId = "overview",
  onDiscardTemporarySource,
  policyProfileLabel,
  playbackToolbar,
  reviewMode = "full",
  reviewOpenFocusRequest = null,
  runConfigurationLabel,
  scopeLabel,
  sourceLifecycle = null,
  sourceLabel,
  sourceMeta,
  statusByBlockId,
  shortcutPreferences = DEFAULT_SHORTCUT_PREFERENCES,
  temporaryReview = null,
  validationReason,
  validationSimilarity,
  validationTranscript,
  voiceProfileLabel,
  onActiveBlockChange,
  onEditedTextByBlockIdChange,
  onHistoryEntriesChange,
  onInspectStructure,
  keepTemporarySourceDisabledReason,
  onKeepTemporarySource,
  onNextIssue,
  onPreviewSpeech,
  onReviewModeChange,
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
  const handledReviewFocusRequestIdRef = useRef<number | null>(null);
  const keepTemporaryDisabledReason = temporaryReviewKeepDisabledReason(
    onKeepTemporarySource,
    keepTemporarySourceDisabledReason,
  );
  const pendingRepairFocusRef = useRef(false);
  const selectedRepairRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setActiveTabId(normalizeRevisionTabId(initialTabId));
  }, [initialTabId]);

  useEffect(() => {
    if (reviewMode === "quick" && (activeTabId === "diagnostics" || activeTabId === "history")) {
      setActiveTabId("overview");
      onTabChange?.("overview");
    }
  }, [activeTabId, onTabChange, reviewMode]);

  const blocksWithState = useMemo(() => {
    const scopedBlocks = reviewBlocksForMode(blocks, reviewMode);
    return scopedBlocks.length > 0 ? scopedBlocks : blocks;
  }, [blocks, reviewMode]);
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
  const cleanVisibleBlocks = useMemo(
    () => filteredBlocks.filter(revisionBlockIsCleanApprovable),
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

  useEffect(() => {
    if (reviewOpenFocusRequest?.focus !== "needsRepair") {
      return;
    }
    if (handledReviewFocusRequestIdRef.current === reviewOpenFocusRequest.requestId) {
      return;
    }
    handledReviewFocusRequestIdRef.current = reviewOpenFocusRequest.requestId;
    setFilters(DEFAULT_REVISION_FILTERS);
    setActiveTabId("blocks");
    onTabChange?.("blocks");
    const nextBlockId = firstRevisionRepairBlockId(blocksWithState);
    pendingRepairFocusRef.current = Boolean(nextBlockId);
    onActiveBlockChange(nextBlockId);
    setStatusMessage(
      nextBlockId
        ? "Opened the first Review warning. Fix or approve this block, then use Next issue."
        : "Review opened, but no repair items were found.",
    );
  }, [
    blocksWithState,
    onActiveBlockChange,
    onTabChange,
    reviewOpenFocusRequest?.focus,
    reviewOpenFocusRequest?.requestId,
  ]);

  useEffect(() => {
    if (!pendingRepairFocusRef.current || !activeBlock) {
      return;
    }
    pendingRepairFocusRef.current = false;
    globalThis.requestAnimationFrame(() => {
      selectedRepairRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      selectedRepairRef.current?.focus({ preventScroll: true });
    });
  }, [activeBlock]);

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

  const approveCleanVisibleBlocks = () => {
    if (activeDraftDirty) {
      setStatusMessage("Save or discard the inline edit before approving clean blocks.");
      return;
    }
    if (cleanVisibleBlocks.length === 0) {
      setStatusMessage("No low-risk clean blocks are visible for approval.");
      return;
    }
    const timestamp = new Date().toISOString();
    const nextStatusByBlockId = { ...statusByBlockId };
    for (const block of cleanVisibleBlocks) {
      nextStatusByBlockId[block.id] = "approved";
    }
    onStatusByBlockIdChange(nextStatusByBlockId);
    onHistoryEntriesChange((current) => [
      ...current,
      ...cleanVisibleBlocks.map((block) =>
        createRevisionHistoryEntry({
          block,
          context,
          newSpokenText: block.spokenText,
          previousSpokenText: block.spokenText,
          timestamp,
          userAction: "Clean block bulk approved",
        }),
      ),
    ]);
    setStatusMessage(
      `${cleanVisibleBlocks.length.toLocaleString()} clean block${
        cleanVisibleBlocks.length === 1 ? "" : "s"
      } approved for Preview.`,
    );
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
      if (shouldIgnoreNarrationShortcutEvent(event)) {
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
            {temporaryReview?.headerLabel ?? "Revision Panel"}
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
          {temporaryReview ? (
            <p className="mt-1 text-xs vs-muted">
              {temporaryReview.statusLabel} · Review notes, repair decisions, pronunciation
              overrides, and policy changes stay in this session until promoted.
            </p>
          ) : null}
        </div>
        {onInspectStructure || temporaryReview ? (
          <div className="flex flex-wrap items-center gap-2">
            {temporaryReview ? (
              <>
                <SegmentedControl
                  ariaLabel="Review mode"
                  onChange={(value) => {
                    onReviewModeChange?.(value);
                  }}
                  options={[
                    { label: "Quick", value: "quick" },
                    { label: "Full", value: "full" },
                    { label: "Promote", value: "promotion" },
                  ]}
                  value={reviewMode}
                />
                <StatusChip tone="metadata">{reviewModeLabel(reviewMode)}</StatusChip>
              </>
            ) : null}
            <Button
              {...revisionShortcutButtonProps(
                "review.inspector",
                "Content Structure",
                shortcutPreferences,
              )}
              data-testid="workspace-stage-action-inspectStructure"
              disabled={!onInspectStructure}
              onClick={() => {
                onInspectStructure?.();
              }}
              size="sm"
              variant="secondary"
            >
              Content Structure
            </Button>
            {temporaryReview ? (
              <>
                <Button
                  data-testid="ui-action-temporary-review-create-listen"
                  onClick={onPreviewSpeech}
                  size="sm"
                  variant="primary"
                >
                  Create & Listen
                </Button>
                <Button
                  data-testid="ui-action-temporary-review-keep"
                  disabled={Boolean(keepTemporaryDisabledReason)}
                  disabledReason={keepTemporaryDisabledReason}
                  onClick={onKeepTemporarySource}
                  size="sm"
                  variant="secondary"
                >
                  Keep in project
                </Button>
                <Button
                  data-testid="ui-action-temporary-review-discard"
                  onClick={onDiscardTemporarySource}
                  size="sm"
                  variant="ghost"
                >
                  Discard temporary source
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {temporaryReview?.mode === "promotion" ? (
        <div
          className="rounded-lg border bg-[var(--vs-surface)] p-3 text-sm vs-border"
          data-testid="temporary-review-promotion-mapping"
        >
          <p className="font-semibold">Promotion Review</p>
          <p className="mt-1 vs-muted">
            Choose what temporary review data should become part of the project source.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {temporaryReview.promotionMapping.summaryItems.map((item) => (
              <StatusChip key={item} tone="metadata">
                {item}
              </StatusChip>
            ))}
          </div>
        </div>
      ) : null}

      <RevisionHealthBanner
        statusMessage={statusMessage}
        summary={summary}
        onPreviewSpeech={onPreviewSpeech}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.25fr)] xl:items-start">
        <section
          aria-label="Review repair queue"
          className="grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border"
          data-testid="revision-guided-repair-queue"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] vs-muted">
                Repair queue
              </p>
              <h4 className="mt-1 text-base font-semibold">Review warnings</h4>
            </div>
            <StatusChip tone={summary.needsRepair > 0 ? "warning" : "success"}>
              {summary.needsRepair.toLocaleString()} to resolve
            </StatusChip>
          </div>
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
            cleanVisibleCount={cleanVisibleBlocks.length}
            selectedCount={selectedBlockIds.size}
            selectedVisibleCount={selectedVisibleCount}
            visibleCount={filteredBlocks.length}
            onApproveCleanVisible={approveCleanVisibleBlocks}
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
        </section>

        <div className="grid gap-3">
          <RevisionSelectedBlockEditor
            activeBaseBlock={activeBaseBlock}
            activeBlock={activeBlock}
            activeDraftDirty={activeDraftDirty}
            activeTabId={activeTabId}
            blocks={filteredBlocks}
            historyEntries={historyEntries}
            playbackToolbar={playbackToolbar}
            policyProfileLabel={policyProfileLabel}
            repairRef={selectedRepairRef}
            reviewMode={reviewMode}
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
            onNextIssue={onNextIssue}
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
    <div className="grid gap-2 border-b pb-3 vs-border">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-xs font-semibold xl:col-span-2">
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
          <div className="flex items-end md:col-span-2 xl:col-span-1">
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
  cleanVisibleCount,
  selectedCount,
  selectedVisibleCount,
  visibleCount,
  onApproveCleanVisible,
  onBatchAction,
  onClearSelection,
  onToggleVisibleSelection,
}: Readonly<{
  allVisibleSelected: boolean;
  approveDisabledReason?: string;
  cleanVisibleCount: number;
  selectedCount: number;
  selectedVisibleCount: number;
  visibleCount: number;
  onApproveCleanVisible: () => void;
  onBatchAction: (actionId: RevisionBatchActionId) => void;
  onClearSelection: () => void;
  onToggleVisibleSelection: (selected: boolean) => void;
}>) {
  const hasSelection = selectedCount > 0;
  const approveCleanDisabledReason =
    cleanVisibleCount > 0
      ? approveDisabledReason
      : "No visible clean blocks are waiting for approval.";
  return (
    <div className="grid gap-2 border-b pb-3 vs-border">
      <div className="flex flex-wrap items-center gap-2">
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
          data-testid="ui-action-revision-batch-approve-clean"
          disabled={Boolean(approveCleanDisabledReason)}
          disabledReason={approveCleanDisabledReason}
          onClick={onApproveCleanVisible}
          size="sm"
          variant="soft"
        >
          Approve clean blocks ({cleanVisibleCount.toLocaleString()})
        </Button>
        <span className="text-xs font-semibold vs-muted">{selectedCount.toString()} selected</span>
      </div>
      <details
        className="rounded-md border bg-[var(--vs-raised)] px-3 py-2 vs-border"
        open={hasSelection || undefined}
      >
        <summary className="cursor-pointer text-xs font-semibold vs-muted">
          More batch actions
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
      </details>
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
  statusMessage,
  summary,
  onPreviewSpeech,
}: Readonly<{
  statusMessage: string;
  summary: RevisionHealthSummary;
  onPreviewSpeech: () => void;
}>) {
  const readinessTone = summary.previewReadiness === "ready" ? "success" : "warning";
  const hasRepair = summary.needsRepair > 0;
  const repairCountLabel = `${summary.needsRepair.toLocaleString()} review warning${
    summary.needsRepair === 1 ? "" : "s"
  } to resolve`;
  const guidanceTitle = hasRepair ? repairCountLabel : "Review is clear";
  return (
    <div className="grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] vs-muted">
            Guided review
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold">{guidanceTitle}</h4>
            <StatusChip tone={readinessTone}>{revisionPreviewReadinessLabel(summary)}</StatusChip>
          </div>
          <p className="mt-1 text-sm vs-muted">
            Next: {revisionNextActionLabel(summary)}. Preview Speech stays available while warnings
            are resolved.
          </p>
        </div>
        <Button
          data-testid="workspace-stage-action-previewSpeech"
          onClick={onPreviewSpeech}
          size="sm"
          variant="secondary"
        >
          Preview Speech
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <RevisionHealthStat label="Ready" value={summary.ready.toLocaleString()} />
        <RevisionHealthStat label="Needs repair" value={summary.needsRepair.toLocaleString()} />
        <RevisionHealthStat
          label="Pronunciation"
          value={summary.pronunciationItems.toLocaleString()}
        />
        <RevisionHealthStat label="Warnings" value={summary.previewWarnings.toLocaleString()} />
      </div>
      <output
        aria-live="polite"
        className="rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs font-semibold vs-border"
        data-testid="revision-status-message"
      >
        {statusMessage}
      </output>
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
  playbackToolbar,
  policyProfileLabel,
  repairRef,
  reviewMode,
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
  onNextIssue,
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
  playbackToolbar?: ReactNode;
  policyProfileLabel: string;
  repairRef?: Ref<HTMLElement>;
  reviewMode: ReviewMode;
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
  onNextIssue?: () => void;
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
  const nextIssueDisabledReason = summary.needsAttention > 0 ? undefined : "No review issues.";
  const nextIssueShortcut = revisionShortcutButtonProps(
    "review.nextIssue",
    "Next issue",
    shortcutPreferences,
    nextIssueDisabledReason,
  );
  const detailTabOptions = [
    { label: "Overview", testId: "revision-tab-overview", value: "overview" as const },
    { label: "Blocks", testId: "revision-tab-blocks", value: "blocks" as const },
    {
      label: "Pronunciation",
      testId: "revision-tab-pronunciation",
      value: "pronunciation" as const,
    },
    ...(reviewMode === "quick"
      ? []
      : [
          {
            label: "Diagnostics",
            testId: "revision-tab-diagnostics",
            value: "diagnostics" as const,
          },
          { label: "History", testId: "revision-tab-history", value: "history" as const },
        ]),
  ] satisfies {
    label: string;
    testId: string;
    value: RevisionTabId;
  }[];

  return (
    <section
      aria-label={`Selected block editor for ${activeBlock.label}`}
      className="grid scroll-mt-24 gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 outline-none vs-border"
      data-testid="revision-selected-block-editor"
      ref={repairRef}
      tabIndex={-1}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] vs-muted">
            Current repair
          </p>
          <h4 className="mt-1 text-lg font-semibold leading-snug" title={activeBlock.label}>
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

      <div className="grid gap-2 rounded-md border bg-[var(--vs-raised)] p-2 vs-border">
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
            {...nextIssueShortcut}
            data-testid="ui-action-revision-block-next-issue"
            disabled={!onNextIssue || summary.needsAttention === 0}
            disabledReason={nextIssueDisabledReason ?? (onNextIssue ? undefined : "Unavailable.")}
            onClick={() => {
              onNextIssue?.();
            }}
            size="sm"
            variant="secondary"
          >
            Next issue
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      {playbackToolbar ? (
        <div data-testid="revision-selected-playback">{playbackToolbar}</div>
      ) : null}

      <RevisionSourceSpokenSurface block={activeBlock} />

      <RevisionRepairNotesPanel block={activeBlock} />

      <RevisionPronunciationRepair
        block={activeBlock}
        onApplyRepair={(nextSpokenText) => {
          onInlineEditSave(activeBlock, nextSpokenText);
        }}
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
          columns={reviewMode === "quick" ? 3 : 5}
          options={detailTabOptions}
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

function RevisionRepairNotesPanel({ block }: Readonly<{ block: RevisionBlock }>) {
  const notes: { detail: string; id: string; label: string; tone: StatusChipTone }[] = [];
  if (revisionBlockIsSkipped(block)) {
    notes.push({
      detail: block.policyNote || "This content is intentionally silent for the generated audio.",
      id: "skipped",
      label: "Skipped content",
      tone: "neutral",
    });
  }
  if (revisionBlockHasPolicyTransform(block)) {
    notes.push({
      detail:
        block.policyNote ||
        `${REVISION_POLICY_NOTE_LABELS[block.policyNoteType]} speech policy changed this block.`,
      id: "policy",
      label: "Policy transformation",
      tone: "info",
    });
  }
  if (block.warnings.length > 0) {
    notes.push({
      detail: block.warnings.join(" "),
      id: "warnings",
      label: "Warnings",
      tone: "warning",
    });
  }
  if (notes.length === 0) {
    notes.push({
      detail: "No policy, skipped-content, or diagnostic repair notes are attached to this block.",
      id: "clean",
      label: "Repair notes",
      tone: "success",
    });
  }

  return (
    <div
      className="grid gap-2 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border"
      data-testid="revision-selected-block-repair-notes"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Repair Notes</p>
        <StatusChip tone={triageTone(revisionBlockTriageCategory(block))}>
          {REVISION_TRIAGE_LABELS[revisionBlockTriageCategory(block)]}
        </StatusChip>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {notes.map((note) => (
          <div className="rounded-md border bg-[var(--vs-raised)] p-3 vs-border" key={note.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{note.label}</p>
              <StatusChip tone={note.tone}>{note.id === "clean" ? "Clear" : "Review"}</StatusChip>
            </div>
            <p className="mt-2 text-xs leading-5 vs-muted">{note.detail}</p>
          </div>
        ))}
        <div className="rounded-md border bg-[var(--vs-raised)] p-3 vs-border">
          <p className="text-sm font-semibold">Audio Check</p>
          <p className="mt-2 text-xs leading-5 vs-muted">
            {block.spokenText.trim()
              ? `${formatConfidence(block.confidence)} confidence · ${formatDurationLabel(
                  block.estimatedDurationMs,
                )} estimated.`
              : "No spoken form is available, so this block blocks audio generation."}
          </p>
        </div>
      </div>
    </div>
  );
}

function RevisionPronunciationRepair({
  block,
  onApplyRepair,
  onRepair,
}: Readonly<{
  block: RevisionBlock;
  onApplyRepair: (nextSpokenText: string) => void;
  onRepair: () => void;
}>) {
  const pronunciations = block.pronunciations ?? [];
  const normalisations = block.normalisations ?? [];
  const [replacementByKey, setReplacementByKey] = useState<Record<string, string>>({});

  if (pronunciations.length === 0 && normalisations.length === 0) {
    return null;
  }
  const decisions = [
    ...pronunciations.map((decision, index) => ({
      currentSpoken: decision.spoken,
      key: `${block.id}-pronunciation-${index.toString()}-${decision.entryId ?? decision.term}`,
      label: decision.term || decision.originalText,
      meta: decision.scope ?? decision.source,
      original: decision.originalText || decision.term,
      type: "Pronunciation",
    })),
    ...normalisations.map((decision, index) => ({
      currentSpoken: decision.spoken,
      key: `${block.id}-normalisation-${index.toString()}-${decision.kind}-${decision.startOffset.toString()}`,
      label: decision.original,
      meta: decision.rule || decision.kind,
      original: decision.original,
      type: "Normalization",
    })),
  ];

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
        {decisions.map((decision) => {
          const replacement = replacementByKey[decision.key] ?? decision.currentSpoken;
          const repairedText = applyRevisionSpokenRepair(block.spokenText, {
            currentSpoken: decision.currentSpoken,
            original: decision.original,
            replacement,
          });
          const canApply =
            replacement.trim().length > 0 && repairedText.trim() !== block.spokenText.trim();
          return (
            <RevisionRepairDecision
              canApply={canApply}
              key={decision.key}
              label={decision.label}
              meta={`${decision.type} · ${decision.meta}`}
              replacement={replacement}
              spoken={decision.currentSpoken}
              onApply={() => {
                if (!canApply) {
                  return;
                }
                onApplyRepair(repairedText);
              }}
              onReplacementChange={(nextValue) => {
                setReplacementByKey((current) => ({
                  ...current,
                  [decision.key]: nextValue,
                }));
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function RevisionRepairDecision({
  canApply,
  label,
  meta,
  onApply,
  onReplacementChange,
  replacement,
  spoken,
}: Readonly<{
  canApply: boolean;
  label: string;
  meta: string;
  onApply: () => void;
  onReplacementChange: (value: string) => void;
  replacement: string;
  spoken: string;
}>) {
  return (
    <div className="grid gap-1 rounded-md border bg-[var(--vs-surface)] p-3 text-sm vs-border">
      <p className="font-semibold">
        {label} {" -> "} {spoken}
      </p>
      <p className="text-xs vs-muted">{meta}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-xs font-semibold">
          Repair spoken form
          <input
            className={fieldControlClassName}
            data-testid="revision-pronunciation-repair-input"
            onChange={(event) => {
              onReplacementChange(event.target.value);
            }}
            value={replacement}
          />
        </label>
        <div className="flex items-end">
          <Button
            data-testid="ui-action-revision-pronunciation-apply"
            disabled={!canApply}
            disabledReason={
              canApply
                ? undefined
                : "Change the repair text or edit the spoken form manually if no phrase matches."
            }
            onClick={onApply}
            size="sm"
            variant="soft"
          >
            Apply repair
          </Button>
        </div>
      </div>
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
