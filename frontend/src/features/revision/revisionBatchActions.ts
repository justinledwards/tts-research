import {
  createRevisionBatchHistoryEntries,
  type RevisionHistoryContext,
  type RevisionHistoryEntry,
} from "./revisionHistory";
import { REVISION_STATUS_LABELS, type RevisionBlock, type RevisionStatus } from "./revisionFilters";

export const REVISION_BATCH_ACTION_IDS = [
  "approveSelected",
  "retrySelected",
  "regenerateSelected",
  "markNeedsReview",
  "exportSelected",
] as const;

export type RevisionBatchActionId = (typeof REVISION_BATCH_ACTION_IDS)[number];

export interface RevisionBatchActionDefinition {
  actionId: RevisionBatchActionId;
  label: string;
  status?: RevisionStatus;
  testId: string;
}

export interface RevisionBatchActionResult {
  exportText: string | null;
  historyEntries: RevisionHistoryEntry[];
  statusByBlockId: Record<string, RevisionStatus>;
  statusMessage: string;
}

export const REVISION_BATCH_ACTIONS: readonly RevisionBatchActionDefinition[] = [
  {
    actionId: "approveSelected",
    label: "Approve selected",
    status: "approved",
    testId: "ui-action-revision-batch-approve",
  },
  {
    actionId: "retrySelected",
    label: "Retry selected",
    status: "retrying",
    testId: "ui-action-revision-batch-retry",
  },
  {
    actionId: "regenerateSelected",
    label: "Regenerate selected",
    status: "regenerating",
    testId: "ui-action-revision-batch-regenerate",
  },
  {
    actionId: "markNeedsReview",
    label: "Mark needs review",
    status: "needsReview",
    testId: "ui-action-revision-batch-needs-review",
  },
  {
    actionId: "exportSelected",
    label: "Export selected",
    testId: "ui-action-revision-batch-export",
  },
] as const;

export function applyRevisionBatchAction({
  actionId,
  blocks,
  context,
  selectedBlockIds,
  statusByBlockId,
}: Readonly<{
  actionId: RevisionBatchActionId;
  blocks: readonly RevisionBlock[];
  context: RevisionHistoryContext;
  selectedBlockIds: ReadonlySet<string>;
  statusByBlockId: Readonly<Record<string, RevisionStatus>>;
}>): RevisionBatchActionResult {
  const action = REVISION_BATCH_ACTIONS.find((candidate) => candidate.actionId === actionId);
  const selectedBlocks = blocks.filter((block) => selectedBlockIds.has(block.id));
  if (!action || selectedBlocks.length === 0) {
    return {
      exportText: null,
      historyEntries: [],
      statusByBlockId: { ...statusByBlockId },
      statusMessage: "Select one or more blocks first.",
    };
  }

  const timestamp = new Date().toISOString();
  const nextStatusByBlockId = { ...statusByBlockId };
  if (action.status) {
    for (const block of selectedBlocks) {
      nextStatusByBlockId[block.id] = action.status;
    }
  }

  const historyEntries = createRevisionBatchHistoryEntries({
    blocks: selectedBlocks,
    context,
    timestamp,
    userAction: action.label,
  });
  const selectedLabel = `${selectedBlocks.length.toLocaleString()} block${selectedBlocks.length === 1 ? "" : "s"}`;
  const statusMessage = action.status
    ? `${selectedLabel} set to ${REVISION_STATUS_LABELS[action.status].toLowerCase()}.`
    : `${selectedLabel} exported for review.`;

  return {
    exportText: actionId === "exportSelected" ? exportRevisionBlocks(selectedBlocks) : null,
    historyEntries,
    statusByBlockId: nextStatusByBlockId,
    statusMessage,
  };
}

function exportRevisionBlocks(blocks: readonly RevisionBlock[]): string {
  return blocks
    .map((block) =>
      [
        `#${block.index.toString()} ${block.label}`,
        `Status: ${REVISION_STATUS_LABELS[block.status]}`,
        `Policy: ${block.policyNote}`,
        "",
        block.spokenText,
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}
