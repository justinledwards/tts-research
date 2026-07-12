import type { RevisionBlock } from "./revisionFilters";

export interface RevisionHistoryContext {
  policyProfile: string;
  runConfiguration: string;
  voiceProfile: string;
}

export interface RevisionHistoryEntry {
  blockId: string;
  blockLabel: string;
  id: string;
  newSpokenText: string;
  policyProfile: string;
  previousSpokenText: string;
  runConfiguration: string;
  timestamp: string;
  userAction: string;
  voiceProfile: string;
}

export function createRevisionHistoryEntry({
  block,
  context,
  newSpokenText,
  previousSpokenText,
  timestamp = new Date().toISOString(),
  userAction,
}: Readonly<{
  block: RevisionBlock;
  context: RevisionHistoryContext;
  newSpokenText: string;
  previousSpokenText: string;
  timestamp?: string;
  userAction: string;
}>): RevisionHistoryEntry {
  return {
    blockId: block.id,
    blockLabel: block.label,
    id: revisionHistoryEntryId(block.id, userAction, timestamp),
    newSpokenText,
    policyProfile: context.policyProfile,
    previousSpokenText,
    runConfiguration: context.runConfiguration,
    timestamp,
    userAction,
    voiceProfile: context.voiceProfile,
  };
}

export function createRevisionBatchHistoryEntries({
  blocks,
  context,
  timestamp = new Date().toISOString(),
  userAction,
}: Readonly<{
  blocks: readonly RevisionBlock[];
  context: RevisionHistoryContext;
  timestamp?: string;
  userAction: string;
}>): RevisionHistoryEntry[] {
  return blocks.map((block) =>
    createRevisionHistoryEntry({
      block,
      context,
      newSpokenText: block.spokenText,
      previousSpokenText: block.spokenText,
      timestamp,
      userAction,
    }),
  );
}

export function latestRevisionEditForBlock(
  entries: readonly RevisionHistoryEntry[],
  blockId: string,
): RevisionHistoryEntry | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.blockId === blockId && entry.previousSpokenText !== entry.newSpokenText) {
      return entry;
    }
  }
  return null;
}

export function revisionHistoryEntryId(blockId: string, action: string, timestamp: string): string {
  return `${slugHistoryPart(blockId)}-${slugHistoryPart(action)}-${slugHistoryPart(timestamp)}`;
}

function slugHistoryPart(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 48);
}
