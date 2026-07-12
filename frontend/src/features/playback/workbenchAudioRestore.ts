import type { BookScope, BookSource, PreparedSource, VoiceJob } from "../../types";
import { bookScopeKey } from "../book-cinema/model";
import { completedJobHasPlayableAudio } from "./generatedAudioLifecycle";

export type WorkbenchAudioRestoreSource =
  | {
      readonly mode: "prepared";
      readonly source: PreparedSource;
    }
  | {
      readonly mode: "book";
      readonly scope: BookScope | null;
      readonly source: BookSource;
    }
  | {
      readonly mode: "draft";
      readonly text: string;
    };

export interface WorkbenchAudioRestoreInput {
  readonly activeProjectId: string;
  readonly currentJob: VoiceJob | null;
  readonly jobs: readonly VoiceJob[];
  readonly source: WorkbenchAudioRestoreSource;
}

const TERMINAL_STATUSES = new Set(["cancelled", "completed", "failed"]);

export function findRestorableWorkbenchJob({
  activeProjectId,
  currentJob,
  jobs,
  source,
}: WorkbenchAudioRestoreInput): VoiceJob | null {
  if (currentJob && !TERMINAL_STATUSES.has(currentJob.status)) {
    return null;
  }
  if (
    currentJob &&
    isPlayableCompletedJob(currentJob) &&
    belongsToProject(currentJob, activeProjectId) &&
    voiceJobMatchesWorkbenchSource(currentJob, source) &&
    !isJobStaleForSource(currentJob, source)
  ) {
    return null;
  }

  let newestEligibleJob: VoiceJob | null = null;
  for (const candidate of jobs) {
    if (
      !belongsToProject(candidate, activeProjectId) ||
      !isPlayableCompletedJob(candidate) ||
      !voiceJobMatchesWorkbenchSource(candidate, source) ||
      isJobStaleForSource(candidate, source)
    ) {
      continue;
    }
    if (!newestEligibleJob || compareNewestJobFirst(candidate, newestEligibleJob) < 0) {
      newestEligibleJob = candidate;
    }
  }

  return newestEligibleJob;
}

export function voiceJobMatchesWorkbenchSource(
  job: VoiceJob,
  source: WorkbenchAudioRestoreSource,
): boolean {
  if (source.mode === "draft") {
    return false;
  }
  if (source.mode === "book") {
    if (!source.scope) {
      return false;
    }
    const jobScope = job.bookScope;
    if (!jobScope) {
      return false;
    }
    return (
      job.bookSourceId === source.source.id && bookScopeKey(jobScope) === bookScopeKey(source.scope)
    );
  }
  if (job.preparedSourceId) {
    return job.preparedSourceId === source.source.id;
  }
  if (job.bookSourceId) {
    return false;
  }
  const sourceText = comparableSourceText(source.source);
  return sourceText.length > 0 && sourceText === comparableJobText(job);
}

function isPlayableCompletedJob(job: VoiceJob): boolean {
  return completedJobHasPlayableAudio(job);
}

function belongsToProject(job: VoiceJob, activeProjectId: string): boolean {
  return (job.projectId || "default") === activeProjectId;
}

function isJobStaleForSource(job: VoiceJob, source: WorkbenchAudioRestoreSource): boolean {
  const sourceUpdatedAt = sourceUpdatedTimestamp(source);
  const jobCompletedAt = jobTimestamp(job);
  return (
    typeof sourceUpdatedAt === "number" &&
    typeof jobCompletedAt === "number" &&
    jobCompletedAt < sourceUpdatedAt
  );
}

function sourceUpdatedTimestamp(source: WorkbenchAudioRestoreSource): number | null {
  if (source.mode === "draft") {
    return null;
  }
  return timestamp(source.source.updatedAt);
}

function jobTimestamp(job: VoiceJob): number | null {
  return timestamp(job.completedAt ?? job.updatedAt);
}

function timestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNewestJobFirst(left: VoiceJob, right: VoiceJob): number {
  const leftTimestamp = jobTimestamp(left) ?? 0;
  const rightTimestamp = jobTimestamp(right) ?? 0;
  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }
  return right.id.localeCompare(left.id);
}

function comparableSourceText(source: PreparedSource): string {
  return normalizeText(source.speechText ?? source.text ?? "");
}

function comparableJobText(job: VoiceJob): string {
  return normalizeText(job.inputText || job.optimizedText || "");
}

function normalizeText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toLowerCase();
}
