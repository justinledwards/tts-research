import type { VoiceJob } from "../../types";
import type { RevisionBlock } from "../revision";

export type PreviewQueueItemStatus = "failed" | "generating" | "ready" | "skipped" | "waiting";

export interface PreviewQueueItem {
  readonly audioReady: boolean;
  readonly canPreview: boolean;
  readonly disabledReason: string | null;
  readonly durationMs: number;
  readonly endSec: number;
  readonly estimatedDurationMs: number;
  readonly id: string;
  readonly index: number;
  readonly label: string;
  readonly policyNote: string;
  readonly policyNoteType: string;
  readonly segmentCount: number;
  readonly segmentStartIndex: number;
  readonly sourceSection: string;
  readonly speakMode: string;
  readonly spokenText: string;
  readonly startSec: number;
  readonly status: PreviewQueueItemStatus;
  readonly text: string;
}

export interface PreviewQueue {
  readonly durationMs: number;
  readonly hasGeneratedAudio: boolean;
  readonly items: PreviewQueueItem[];
  readonly readyCount: number;
  readonly totalCount: number;
}

export interface PreviewQueueProgress {
  readonly currentLabel: string;
  readonly durationLabel: string;
  readonly ratio: number;
}

const DEFAULT_PREVIEW_QUEUE_OPTIONS = { skipSilence: false } as const;

export function buildPreviewQueue(
  blocks: readonly RevisionBlock[],
  job: VoiceJob | null,
): PreviewQueue {
  const durations = previewSegmentDurations(job);
  const hasGeneratedAudio = Boolean(job?.audioUrl) && job?.status === "completed";
  let segmentCursor = 0;
  let estimatedCursorMs = 0;

  const items = blocks.map((block): PreviewQueueItem => {
    const segmentCount = Math.max(1, block.segmentCount || 1);
    const durationMs = blockDurationMs(block, durations, segmentCursor, segmentCount);
    const startSec = estimatedCursorMs / 1000;
    const endSec = (estimatedCursorMs + durationMs) / 1000;
    const status = previewQueueItemStatus(block, job, segmentCursor, segmentCount);
    const audioReady = hasGeneratedAudio && status !== "failed" && status !== "skipped";
    const canPreview = audioReady && block.spokenText.trim().length > 0;
    const disabledReason = canPreview
      ? null
      : previewDisabledReason({ block, hasGeneratedAudio, status });

    const item: PreviewQueueItem = {
      audioReady,
      canPreview,
      disabledReason,
      durationMs,
      endSec,
      estimatedDurationMs: block.estimatedDurationMs,
      id: block.id,
      index: block.index,
      label: block.label,
      policyNote: block.policyNote,
      policyNoteType: block.policyNoteType,
      segmentCount,
      segmentStartIndex: segmentCursor + 1,
      sourceSection: block.sourceSection,
      speakMode: block.speakMode,
      spokenText: block.spokenText,
      startSec,
      status,
      text: block.text,
    };
    segmentCursor += segmentCount;
    estimatedCursorMs += durationMs;
    return item;
  });

  return {
    durationMs: previewQueueDurationMs(items, job),
    hasGeneratedAudio,
    items,
    readyCount: items.filter((item) => item.audioReady).length,
    totalCount: items.length,
  };
}

export function resolvePreviewQueueIndex(
  queue: PreviewQueue,
  activeBlockId: string | null,
  playbackCursorSec: number,
): number {
  if (activeBlockId) {
    const byBlockId = queue.items.findIndex((item) => item.id === activeBlockId);
    if (byBlockId !== -1) {
      return byBlockId;
    }
  }
  const byCursor = queue.items.findIndex(
    (item) => playbackCursorSec >= item.startSec && playbackCursorSec < item.endSec,
  );
  if (byCursor !== -1) {
    return byCursor;
  }
  return queue.items.length > 0 ? 0 : -1;
}

export function findAdjacentPreviewQueueItem(
  queue: PreviewQueue,
  currentIndex: number,
  direction: -1 | 1,
  options: Readonly<{ skipSilence: boolean }> = DEFAULT_PREVIEW_QUEUE_OPTIONS,
): PreviewQueueItem | null {
  if (queue.items.length === 0) {
    return null;
  }
  let index = normalizeQueueIndex(currentIndex, queue.items.length) + direction;
  while (index >= 0 && index < queue.items.length) {
    const item = queue.items[index];
    if (!options.skipSilence || !isSkippablePreviewItem(item)) {
      return item;
    }
    index += direction;
  }
  return queue.items[normalizeQueueIndex(currentIndex, queue.items.length)] ?? null;
}

export function previewSeekTargetSec(item: PreviewQueueItem | null | undefined): number {
  return Math.max(0, item?.startSec ?? 0);
}

export function isSkippablePreviewItem(item: PreviewQueueItem): boolean {
  const speakMode = item.speakMode.trim().toLowerCase();
  const noteType = item.policyNoteType.trim().toLowerCase();
  return (
    speakMode === "skip" ||
    noteType === "skipped" ||
    noteType === "ondemand" ||
    item.spokenText.trim().length === 0 ||
    item.durationMs <= 250
  );
}

export function previewQueueProgress(
  queue: PreviewQueue,
  playbackCursorSec: number,
): PreviewQueueProgress {
  const durationMs = Math.max(0, queue.durationMs);
  const currentMs = Math.max(0, Math.min(playbackCursorSec * 1000, durationMs));
  return {
    currentLabel: formatPreviewClock(currentMs),
    durationLabel: formatPreviewClock(durationMs),
    ratio: durationMs > 0 ? currentMs / durationMs : 0,
  };
}

export function countPreviewWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function formatPreviewClock(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalSeconds = Math.round(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString()}:${seconds.toString().padStart(2, "0")}`;
}

function previewSegmentDurations(job: VoiceJob | null): number[] {
  if (!job) {
    return [];
  }
  if (job.audioSegmentDurationsMs && job.audioSegmentDurationsMs.length > 0) {
    return job.audioSegmentDurationsMs.map((duration) => safeDurationMs(duration));
  }
  return (job.segments ?? []).map((segment) => safeDurationMs(segment.durationMs));
}

function blockDurationMs(
  block: RevisionBlock,
  durations: readonly number[],
  segmentCursor: number,
  segmentCount: number,
): number {
  const segmentDuration = durations
    .slice(segmentCursor, segmentCursor + segmentCount)
    .reduce((total, duration) => total + duration, 0);
  if (segmentDuration > 0) {
    return segmentDuration;
  }
  return safeDurationMs(block.estimatedDurationMs);
}

function previewQueueItemStatus(
  block: RevisionBlock,
  job: VoiceJob | null,
  segmentCursor: number,
  segmentCount: number,
): PreviewQueueItemStatus {
  if (block.speakMode.trim().toLowerCase() === "skip" || block.status === "skipped") {
    return "skipped";
  }
  if (!job) {
    return "waiting";
  }
  const segmentStatuses = (job.segments ?? [])
    .slice(segmentCursor, segmentCursor + segmentCount)
    .map((segment) => segment.status)
    .filter(Boolean);
  if (segmentStatuses.includes("failed")) {
    return "failed";
  }
  if (segmentStatuses.some((status) => status === "running" || status === "checking")) {
    return "generating";
  }
  if (job.status === "completed" || segmentStatuses.every((status) => status === "ready")) {
    return "ready";
  }
  if (job.status === "failed" || job.status === "cancelled") {
    return "failed";
  }
  if (job.status === "synthesizing" || job.status === "checking" || job.status === "retrying") {
    return "generating";
  }
  return "waiting";
}

function previewDisabledReason({
  block,
  hasGeneratedAudio,
  status,
}: Readonly<{
  block: RevisionBlock;
  hasGeneratedAudio: boolean;
  status: PreviewQueueItemStatus;
}>): string {
  if (!hasGeneratedAudio) {
    return "Create & Listen before auditioning generated audio.";
  }
  if (status === "skipped") {
    return "This block is skipped by the current speech policy.";
  }
  if (status === "failed") {
    return "This block needs regeneration before preview.";
  }
  if (!block.spokenText.trim()) {
    return "This block has no spoken form to preview.";
  }
  return "Generated audio is not ready for this block yet.";
}

function previewQueueDurationMs(items: readonly PreviewQueueItem[], job: VoiceJob | null): number {
  if (job?.durationMs && job.durationMs > 0) {
    return job.durationMs;
  }
  return items.reduce((total, item) => total + item.durationMs, 0);
}

function normalizeQueueIndex(index: number, length: number): number {
  if (length <= 0) {
    return -1;
  }
  return Math.min(length - 1, Math.max(0, index));
}

function safeDurationMs(value: number | null | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 0;
  }
  return Math.round(value);
}
