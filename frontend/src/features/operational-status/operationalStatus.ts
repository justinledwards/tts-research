import type { StatusChipTone } from "../../design";
import type { JobTerminalReason, VoiceJob } from "../../types";
import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";

export const OPERATIONAL_STATUS_OWNERS = [
  "source",
  "review",
  "audio",
  "queue",
  "check",
  "system",
  "cloning",
  "importExport",
  "diagnostics",
] as const;

export type OperationalStatusOwner = (typeof OPERATIONAL_STATUS_OWNERS)[number];

export const OPERATIONAL_STATUS_CONDITIONS = [
  "ready",
  "waiting",
  "working",
  "missing",
  "stale",
  "degraded",
  "failed",
  "cancelled",
  "blocked",
  "attention",
] as const;

export type OperationalStatusCondition = (typeof OPERATIONAL_STATUS_CONDITIONS)[number];

export type OperationalStatusSeverity = "ok" | "info" | "warning" | "error" | "critical";

export type OperationalRecoveryActionId =
  | "cancelRun"
  | "createAndListen"
  | "none"
  | "openCinema"
  | "openDiagnostics"
  | "openIntake"
  | "openReview"
  | "openVoiceCloning"
  | "rebuildAudio"
  | "retryGeneration";

export interface OperationalRecoveryAction {
  readonly available: boolean;
  readonly id: OperationalRecoveryActionId;
  readonly label: string;
  readonly unavailableReason?: string;
}

export interface OperationalStatusIssue {
  readonly blocksCurrentStage: boolean;
  readonly chipValue: string;
  readonly condition: OperationalStatusCondition;
  readonly detail: string;
  readonly id: string;
  readonly label: string;
  readonly owner: OperationalStatusOwner;
  readonly recovery: OperationalRecoveryAction;
  readonly severity: OperationalStatusSeverity;
  readonly technicalDetail?: string;
}

interface OperationalAudioIssueInput {
  readonly canCancel?: boolean;
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly job: VoiceJob | null;
  readonly lifecycle: GeneratedAudioLifecycleState;
  readonly requiresAudio?: boolean;
}

export const OPERATIONAL_RECOVERY_LABELS: Record<OperationalRecoveryActionId, string> = {
  cancelRun: "Cancel Run",
  createAndListen: "Create & Listen",
  none: "No action available",
  openCinema: "Open Cinema",
  openDiagnostics: "Open diagnostics",
  openIntake: "Open Intake",
  openReview: "Open Review",
  openVoiceCloning: "Open Voice Cloning",
  rebuildAudio: "Rebuild audio",
  retryGeneration: "Retry generation",
};

const SEVERITY_RANK: Record<OperationalStatusSeverity, number> = {
  critical: 90,
  error: 80,
  warning: 60,
  info: 40,
  ok: 10,
};

const OWNER_RANK: Record<OperationalStatusOwner, number> = {
  source: 90,
  review: 80,
  audio: 70,
  cloning: 60,
  queue: 50,
  check: 40,
  system: 30,
  diagnostics: 20,
  importExport: 10,
};

export function operationalRecovery(
  id: OperationalRecoveryActionId,
  available: boolean,
  unavailableReason?: string,
): OperationalRecoveryAction {
  return {
    available,
    id,
    label: OPERATIONAL_RECOVERY_LABELS[id],
    unavailableReason,
  };
}

export function operationalIssueTone(issue: OperationalStatusIssue): StatusChipTone {
  if (issue.severity === "critical" || issue.severity === "error") {
    return "danger";
  }
  if (issue.severity === "warning") {
    return "warning";
  }
  if (issue.severity === "info") {
    return "info";
  }
  if (issue.condition === "ready") {
    return "success";
  }
  return "neutral";
}

export function compareOperationalIssues(
  left: OperationalStatusIssue,
  right: OperationalStatusIssue,
): number {
  const severityDelta = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }
  const blockingDelta = Number(right.blocksCurrentStage) - Number(left.blocksCurrentStage);
  if (blockingDelta !== 0) {
    return blockingDelta;
  }
  return OWNER_RANK[right.owner] - OWNER_RANK[left.owner];
}

export function selectPrimaryOperationalIssue(
  issues: readonly OperationalStatusIssue[],
): OperationalStatusIssue | null {
  let selected: OperationalStatusIssue | null = null;
  for (const issue of issues) {
    if (issue.severity === "ok" && !issue.blocksCurrentStage) {
      continue;
    }
    if (!selected || compareOperationalIssues(issue, selected) < 0) {
      selected = issue;
    }
  }
  return selected;
}

export function operationalGeneratedAudioLifecycleLabel(
  state: GeneratedAudioLifecycleState,
): string {
  switch (state) {
    case "archived": {
      return "Audio archived";
    }
    case "degraded":
    case "stale": {
      return "Audio needs rebuild";
    }
    case "failed": {
      return "Generation failed";
    }
    case "generating": {
      return "Generating";
    }
    case "missing": {
      return "Audio missing";
    }
    case "queued": {
      return "Queued";
    }
    case "ready": {
      return "Audio ready";
    }
  }
}

export function operationalGeneratedAudioLifecycleReason(
  state: GeneratedAudioLifecycleState,
): string {
  switch (state) {
    case "archived": {
      return "Audio archived. Restore or rebuild before playback.";
    }
    case "degraded": {
      return "Audio needs rebuild. Rebuild before playback.";
    }
    case "failed": {
      return "Generation failed. Retry generation before playback.";
    }
    case "generating": {
      return "Audio is generating. Playback unlocks when ready.";
    }
    case "missing": {
      return "Audio missing. Create & Listen before playback.";
    }
    case "queued": {
      return "Audio queued. Playback unlocks when ready.";
    }
    case "ready": {
      return "Audio ready.";
    }
    case "stale": {
      return "Audio needs rebuild. Rebuild before treating it as current.";
    }
  }
}

export function resolveOperationalAudioIssue({
  canCancel = false,
  canCreate,
  canOpenCinema,
  job,
  lifecycle,
  requiresAudio = false,
}: OperationalAudioIssueInput): OperationalStatusIssue {
  if (job && isWorkingJobStatus(job.status)) {
    return resolveWorkingAudioIssue(job, canCancel);
  }

  if (job?.status === "cancelled") {
    return resolveCancelledAudioIssue(job, canCreate, requiresAudio);
  }

  if (job?.status === "failed" || lifecycle === "failed") {
    return resolveFailedGenerationIssue(job, canCreate);
  }

  if (lifecycle === "ready") {
    return resolveReadyAudioIssue(job, canOpenCinema);
  }

  if (isAudioRecoveryLifecycle(lifecycle)) {
    return resolveRecoveryAudioIssue(job, lifecycle, canCreate, requiresAudio);
  }

  if (lifecycle === "queued" || lifecycle === "generating") {
    return resolveLifecycleWorkingAudioIssue(job, lifecycle, canCancel);
  }

  return resolveMissingAudioIssue(job, canCreate, requiresAudio);
}

export function resolveOperationalSourceIssue({
  descriptorLabel,
  descriptorSeverity = "ok",
  detail,
  hasSource = true,
  sourceError,
  sourcePreparing = false,
}: Readonly<{
  descriptorLabel: string;
  descriptorSeverity?: OperationalStatusSeverity;
  detail: string;
  hasSource?: boolean;
  sourceError?: string | null;
  sourcePreparing?: boolean;
}>): OperationalStatusIssue {
  if (sourceError) {
    return {
      blocksCurrentStage: true,
      chipValue: "Failed",
      condition: "failed",
      detail: sourceError,
      id: "source-failed",
      label: "Source failed",
      owner: "source",
      recovery: operationalRecovery("openIntake", true),
      severity: "error",
    };
  }
  if (sourcePreparing) {
    return {
      blocksCurrentStage: true,
      chipValue: "Preparing",
      condition: "working",
      detail: "Import, extraction, or source preparation is still running.",
      id: "source-preparing",
      label: "Source preparing",
      owner: "source",
      recovery: operationalRecovery("none", false, "Wait for source preparation to finish."),
      severity: "info",
    };
  }
  if (!hasSource) {
    return {
      blocksCurrentStage: true,
      chipValue: "Missing",
      condition: "missing",
      detail: "Choose draft text, a book, a prepared file, or a URL before continuing.",
      id: "source-missing",
      label: "Source missing",
      owner: "source",
      recovery: operationalRecovery("openIntake", true),
      severity: "warning",
    };
  }
  return {
    blocksCurrentStage: false,
    chipValue: descriptorLabel,
    condition: "ready",
    detail,
    id: "source-ready",
    label: "Source ready",
    owner: "source",
    recovery: operationalRecovery("none", false, "No source recovery is needed."),
    severity: descriptorSeverity,
  };
}

export function resolveOperationalReviewIssue({
  required = false,
  warningCount = 0,
}: Readonly<{ required?: boolean; warningCount?: number }>): OperationalStatusIssue {
  if (required) {
    return {
      blocksCurrentStage: true,
      chipValue: "Required",
      condition: "blocked",
      detail: "Review the active source before moving into generated-audio or read-along stages.",
      id: "review-required",
      label: "Review required",
      owner: "review",
      recovery: operationalRecovery("openReview", true),
      severity: "warning",
    };
  }
  if (warningCount > 0) {
    return {
      blocksCurrentStage: false,
      chipValue: "Needs repair",
      condition: "attention",
      detail: `${warningCount.toString()} review ${warningCount === 1 ? "warning needs" : "warnings need"} attention.`,
      id: "review-needs-repair",
      label: "Review needs repair",
      owner: "review",
      recovery: operationalRecovery("openReview", true),
      severity: "warning",
    };
  }
  return {
    blocksCurrentStage: false,
    chipValue: "Ready",
    condition: "ready",
    detail: "Review is ready.",
    id: "review-ready",
    label: "Review ready",
    owner: "review",
    recovery: operationalRecovery("none", false, "No review recovery is needed."),
    severity: "ok",
  };
}

export function resolveOperationalSystemIssue({
  attentionCount = 0,
  critical = false,
  detail,
}: Readonly<{
  attentionCount?: number;
  critical?: boolean;
  detail?: string;
}>): OperationalStatusIssue {
  if (attentionCount > 0 || critical) {
    return {
      blocksCurrentStage: critical,
      chipValue: critical ? "Critical" : `${attentionCount.toString()} attention`,
      condition: critical ? "blocked" : "attention",
      detail: detail ?? "System diagnostics need attention.",
      id: critical ? "system-critical" : "system-attention",
      label: critical ? "System critical" : "System attention",
      owner: "system",
      recovery: operationalRecovery("openDiagnostics", true),
      severity: critical ? "critical" : "warning",
    };
  }
  return {
    blocksCurrentStage: false,
    chipValue: "Healthy",
    condition: "ready",
    detail: "System diagnostics are healthy.",
    id: "system-healthy",
    label: "System healthy",
    owner: "system",
    recovery: operationalRecovery("none", false, "No system recovery is needed."),
    severity: "ok",
  };
}

export function resolveOperationalCloningIssue({
  actionLabel,
  message,
  status,
}: Readonly<{
  actionLabel: string;
  message: string;
  status: "idle" | "running" | "attention" | "complete" | "cancelled";
}>): OperationalStatusIssue {
  if (status === "attention") {
    return {
      blocksCurrentStage: false,
      chipValue: "Attention",
      condition: "attention",
      detail: message,
      id: "cloning-attention",
      label: "Voice cloning needs attention",
      owner: "cloning",
      recovery: operationalRecovery("openVoiceCloning", Boolean(actionLabel)),
      severity: "warning",
    };
  }
  if (status === "running") {
    return {
      blocksCurrentStage: false,
      chipValue: "Working",
      condition: "working",
      detail: message,
      id: "cloning-working",
      label: "Voice cloning working",
      owner: "cloning",
      recovery: operationalRecovery("openVoiceCloning", true),
      severity: "info",
    };
  }
  if (status === "cancelled") {
    return {
      blocksCurrentStage: false,
      chipValue: "Cancelled",
      condition: "cancelled",
      detail: message,
      id: "cloning-cancelled",
      label: "Voice cloning cancelled",
      owner: "cloning",
      recovery: operationalRecovery("openVoiceCloning", true),
      severity: "info",
    };
  }
  return {
    blocksCurrentStage: false,
    chipValue: status === "complete" ? "Ready" : "Idle",
    condition: status === "complete" ? "ready" : "waiting",
    detail: message,
    id: status === "complete" ? "cloning-ready" : "cloning-idle",
    label: status === "complete" ? "Voice cloning ready" : "Voice cloning idle",
    owner: "cloning",
    recovery: operationalRecovery("none", false, "No voice cloning recovery is needed."),
    severity: "ok",
  };
}

function resolveFailedGenerationIssue(
  job: VoiceJob | null,
  canCreate: boolean,
): OperationalStatusIssue {
  const terminalReason = job?.terminalReason;
  const nonRetriable = terminalReason === "configuration_failed" || job?.retriable === false;
  if (nonRetriable) {
    return audioIssue({
      blocksCurrentStage: true,
      chipValue: "Blocked",
      condition: "blocked",
      detail:
        job?.error ??
        "Generation is blocked by provider, voice, or runtime configuration. Open diagnostics before retrying.",
      id: "audio-configuration-blocked",
      label: "Configuration blocks generation",
      recovery: operationalRecovery("openDiagnostics", true),
      severity: "error",
      technicalDetail: terminalReasonDetail(terminalReason, job),
    });
  }
  return audioIssue({
    blocksCurrentStage: true,
    chipValue: "Failed",
    condition: "failed",
    detail: job?.error ?? "The last generation attempt failed before playable audio was ready.",
    id: "audio-generation-failed",
    label: "Generation failed",
    recovery: operationalRecovery(
      "retryGeneration",
      canCreate,
      canCreate
        ? undefined
        : "Retry generation is unavailable until the source and voice are ready.",
    ),
    severity: "error",
    technicalDetail: terminalReasonDetail(terminalReason, job),
  });
}

function resolveWorkingAudioIssue(job: VoiceJob, canCancel: boolean): OperationalStatusIssue {
  return audioIssue({
    chipValue: "Working",
    condition: "working",
    detail:
      job.progress.detail.trim() || job.progress.message.trim() || "Audio generation is running.",
    id: "audio-working",
    label: "Audio working",
    recovery: canCancel
      ? operationalRecovery("cancelRun", true)
      : operationalRecovery("none", false, "Wait for generation to finish."),
    severity: "info",
    technicalDetail: jobDetail(job),
  });
}

function resolveCancelledAudioIssue(
  job: VoiceJob,
  canCreate: boolean,
  requiresAudio: boolean,
): OperationalStatusIssue {
  const userCancelled = job.terminalReason === "user_cancelled";
  return audioIssue({
    blocksCurrentStage: requiresAudio,
    chipValue: "Cancelled",
    condition: "cancelled",
    detail: userCancelled
      ? "Generation was cancelled by request. Retry generation when audio is needed."
      : "Generation was cancelled before playable audio was ready.",
    id: "audio-generation-cancelled",
    label: "Generation cancelled",
    recovery: operationalRecovery(
      "retryGeneration",
      canCreate,
      canCreate
        ? undefined
        : "Retry generation is unavailable until the source and voice are ready.",
    ),
    severity: requiresAudio ? "warning" : "info",
    technicalDetail: terminalReasonDetail(job.terminalReason, job),
  });
}

function resolveReadyAudioIssue(
  job: VoiceJob | null,
  canOpenCinema: boolean,
): OperationalStatusIssue {
  return audioIssue({
    chipValue: "Ready",
    condition: "ready",
    detail: "Playable generated audio is ready.",
    id: "audio-ready",
    label: "Audio ready",
    recovery: canOpenCinema
      ? operationalRecovery("openCinema", true)
      : operationalRecovery("none", false, "No audio recovery is needed."),
    severity: "ok",
    technicalDetail: job ? jobDetail(job) : undefined,
  });
}

function isAudioRecoveryLifecycle(
  lifecycle: GeneratedAudioLifecycleState,
): lifecycle is Extract<GeneratedAudioLifecycleState, "archived" | "degraded" | "stale"> {
  return lifecycle === "stale" || lifecycle === "degraded" || lifecycle === "archived";
}

function resolveRecoveryAudioIssue(
  job: VoiceJob | null,
  lifecycle: Extract<GeneratedAudioLifecycleState, "archived" | "degraded" | "stale">,
  canCreate: boolean,
  requiresAudio: boolean,
): OperationalStatusIssue {
  const recoveryUnavailableReason =
    "Rebuild audio is unavailable until the source and voice are ready.";
  return audioIssue({
    blocksCurrentStage: requiresAudio,
    chipValue: "Needs rebuild",
    condition: lifecycle === "degraded" ? "degraded" : "stale",
    detail: operationalGeneratedAudioLifecycleReason(lifecycle),
    id: `audio-${lifecycle}`,
    label: "Audio needs rebuild",
    recovery: operationalRecovery(
      "rebuildAudio",
      canCreate,
      canCreate ? undefined : recoveryUnavailableReason,
    ),
    severity: "warning",
    technicalDetail: job ? jobDetail(job) : undefined,
  });
}

function resolveLifecycleWorkingAudioIssue(
  job: VoiceJob | null,
  lifecycle: Extract<GeneratedAudioLifecycleState, "generating" | "queued">,
  canCancel: boolean,
): OperationalStatusIssue {
  return audioIssue({
    chipValue: lifecycle === "queued" ? "Queued" : "Working",
    condition: "working",
    detail: operationalGeneratedAudioLifecycleReason(lifecycle),
    id: lifecycle === "queued" ? "audio-queued" : "audio-working",
    label: "Audio working",
    recovery: canCancel
      ? operationalRecovery("cancelRun", true)
      : operationalRecovery("none", false, "Wait for generation to finish."),
    severity: "info",
    technicalDetail: job ? jobDetail(job) : undefined,
  });
}

function resolveMissingAudioIssue(
  job: VoiceJob | null,
  canCreate: boolean,
  requiresAudio: boolean,
): OperationalStatusIssue {
  return audioIssue({
    blocksCurrentStage: requiresAudio,
    chipValue: "Missing",
    condition: "missing",
    detail: "No generated audio exists for the current source and scope.",
    id: "audio-missing",
    label: "Audio missing",
    recovery: operationalRecovery(
      "createAndListen",
      canCreate,
      canCreate
        ? undefined
        : "Create & Listen is unavailable until the source and voice are ready.",
    ),
    severity: requiresAudio ? "warning" : "ok",
    technicalDetail: job ? jobDetail(job) : undefined,
  });
}

function audioIssue(
  issue: Omit<OperationalStatusIssue, "blocksCurrentStage" | "owner"> &
    Partial<Pick<OperationalStatusIssue, "blocksCurrentStage">>,
): OperationalStatusIssue {
  return {
    blocksCurrentStage: false,
    owner: "audio",
    ...issue,
  };
}

function isWorkingJobStatus(status: VoiceJob["status"]): boolean {
  return (
    status === "queued" ||
    status === "optimizing" ||
    status === "synthesizing" ||
    status === "checking" ||
    status === "retrying"
  );
}

function terminalReasonDetail(
  terminalReason: JobTerminalReason | undefined,
  job: VoiceJob | null,
): string | undefined {
  const parts = [
    terminalReason ? `terminalReason=${terminalReason}` : null,
    job?.retriable === undefined ? null : `retriable=${String(job.retriable)}`,
    job ? `status=${job.status}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function jobDetail(job: VoiceJob): string {
  return [
    `status=${job.status}`,
    job.terminalReason ? `terminalReason=${job.terminalReason}` : null,
    job.retriable === undefined ? null : `retriable=${String(job.retriable)}`,
    job.progress.activeStage ? `stage=${job.progress.activeStage}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}
