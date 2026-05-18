import type { VoiceProfile } from "./types";

export interface VoiceLibraryEntry {
  profile: VoiceProfile;
  selected: boolean;
  pinned: boolean;
  recent: boolean;
}

export interface VoiceLibraryViewModel {
  entries: VoiceLibraryEntry[];
  total: number;
}

export interface CancellableActivitySummary {
  id: string;
  label: string;
  detail: string;
  status: "idle" | "running" | "attention" | "complete" | "cancelled";
  canCancel: boolean;
  cancelLabel: string;
}

export function buildVoiceLibraryViewModel({
  limit = 4,
  pinnedIds = [],
  profiles,
  recentIds = [],
  selectedProfileId,
}: Readonly<{
  limit?: number;
  pinnedIds?: string[];
  profiles: VoiceProfile[];
  recentIds?: string[];
  selectedProfileId: string;
}>): VoiceLibraryViewModel {
  const pinnedRank = rankMap(pinnedIds);
  const recentRank = rankMap(recentIds);
  const sortedProfiles = [...profiles];
  sortedProfiles.sort((left, right) =>
    compareVoiceProfiles(left, right, selectedProfileId, pinnedRank, recentRank),
  );
  const entries = sortedProfiles.slice(0, limit).map((profile) => ({
    pinned: pinnedRank.has(profile.id),
    profile,
    recent: recentRank.has(profile.id),
    selected: profile.id === selectedProfileId,
  }));

  return { entries, total: profiles.length };
}

function compareVoiceProfiles(
  left: VoiceProfile,
  right: VoiceProfile,
  selectedProfileId: string,
  pinnedRank: Map<string, number>,
  recentRank: Map<string, number>,
): number {
  const leftSelected = left.id === selectedProfileId ? 0 : 1;
  const rightSelected = right.id === selectedProfileId ? 0 : 1;
  if (leftSelected !== rightSelected) {
    return leftSelected - rightSelected;
  }

  const pinned = compareRank(left.id, right.id, pinnedRank);
  if (pinned !== 0) {
    return pinned;
  }

  const recent = compareRank(left.id, right.id, recentRank);
  if (recent !== 0) {
    return recent;
  }

  const leftName = left.name.trim().toLocaleLowerCase();
  const rightName = right.name.trim().toLocaleLowerCase();
  if (leftName !== rightName) {
    return leftName.localeCompare(rightName);
  }

  const leftCreated = Date.parse(left.createdAt);
  const rightCreated = Date.parse(right.createdAt);
  if (
    Number.isFinite(leftCreated) &&
    Number.isFinite(rightCreated) &&
    leftCreated !== rightCreated
  ) {
    return leftCreated - rightCreated;
  }
  return left.id.localeCompare(right.id);
}

function compareRank(leftId: string, rightId: string, rank: Map<string, number>): number {
  const leftRank = rank.get(leftId) ?? Number.POSITIVE_INFINITY;
  const rightRank = rank.get(rightId) ?? Number.POSITIVE_INFINITY;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return 0;
}

function rankMap(ids: readonly string[]): Map<string, number> {
  return new Map(ids.map((id, index) => [id, index]));
}
