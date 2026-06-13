import type {
  TemporarySourceSession,
  TemporaryStorageUsageSession,
  VoiceJob,
  VoiceProject,
} from "../../types";

export const COMMAND_CENTER_ROUTE_IDS = [
  "overview",
  "projects",
  "temporary",
  "assets",
  "activity",
  "importsExports",
  "reports",
] as const;

export type CommandCenterRouteId = (typeof COMMAND_CENTER_ROUTE_IDS)[number];

export interface CommandCenterRouteDefinition {
  readonly id: CommandCenterRouteId;
  readonly label: string;
  readonly detail: string;
  readonly headline: string;
  readonly description: string;
}

export const COMMAND_CENTER_ROUTES: readonly CommandCenterRouteDefinition[] = [
  {
    id: "overview",
    label: "Overview",
    detail: "Current work and routes",
    headline: "Project operations without cluttering narration",
    description:
      "Project library and current chapter context. Use this surface for project-level actions, assets, activity, imports, exports, and reports. Closing returns to the current narration task.",
  },
  {
    id: "projects",
    label: "Projects",
    detail: "Library and audio",
    headline: "Project library and generated audio",
    description:
      "Open, rename, export, or protect projects from one stable command surface without disturbing the current workbench.",
  },
  {
    id: "temporary",
    label: "Temporary Work",
    detail: "Recent temporary sources",
    headline: "Recent temporary work without project clutter",
    description:
      "Find temporary sources before expiry, review storage, and choose lifecycle actions from a shelf that stays separate from Projects and Assets.",
  },
  {
    id: "assets",
    label: "Assets",
    detail: "Sources, voices, policy",
    headline: "Source and voice assets outside the narration stage",
    description:
      "Books, prepared files, URLs, voice profiles, and speech policy are grouped here as reusable project material.",
  },
  {
    id: "activity",
    label: "Activity",
    detail: "Live work and cancellation",
    headline: "Background work that can be understood and stopped",
    description:
      "Every long-running task belongs here with plain status, last-known detail, and a cancellation path when the backend supports it.",
  },
  {
    id: "importsExports",
    label: "Import/Export",
    detail: "Portable bundles",
    headline: "Portable project movement and review",
    description:
      "Bundle operations are grouped here so the header can stay compact and the workbench can stay focused on source and review.",
  },
  {
    id: "reports",
    label: "Reports",
    detail: "Health and diagnostics",
    headline: "System health, diagnostics, and provider readiness",
    description:
      "A short operational view for backend status, GPU telemetry, and the route into deeper Settings diagnostics.",
  },
] as const;

export function commandCenterRouteDefinition(
  routeId: CommandCenterRouteId,
): CommandCenterRouteDefinition {
  return COMMAND_CENTER_ROUTES.find((route) => route.id === routeId) ?? COMMAND_CENTER_ROUTES[0];
}

export function sortCommandCenterProjects(
  projects: readonly VoiceProject[],
  activeProjectId: string,
): VoiceProject[] {
  // Stable management ordering keeps the active project pinned before recency sorting.
  // eslint-disable-next-line unicorn/no-array-sort
  return [...projects].sort((left, right) => {
    if (left.id === activeProjectId && right.id !== activeProjectId) {
      return -1;
    }
    if (right.id === activeProjectId && left.id !== activeProjectId) {
      return 1;
    }
    return dateValue(right.updatedAt) - dateValue(left.updatedAt);
  });
}

export function visibleCommandCenterJobs({
  activeProjectId,
  job,
  projectJobs,
}: Readonly<{
  activeProjectId: string;
  job: VoiceJob | null;
  projectJobs: readonly VoiceJob[];
}>): VoiceJob[] {
  const candidates = [
    ...(job?.projectId === activeProjectId && !job.temporarySourceId ? [job] : []),
    ...projectJobs.filter((item) => item.projectId === activeProjectId && !item.temporarySourceId),
  ];
  const seen = new Set<string>();
  const uniqueJobs = candidates.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
  // eslint-disable-next-line unicorn/no-array-sort
  return uniqueJobs.sort((left, right) => dateValue(right.updatedAt) - dateValue(left.updatedAt));
}

export function visibleTemporaryCommandCenterJobs({
  job,
  projectJobs,
}: Readonly<{
  job: VoiceJob | null;
  projectJobs: readonly VoiceJob[];
}>): VoiceJob[] {
  const candidates = [...(job?.temporarySourceId ? [job] : []), ...projectJobs].filter((item) =>
    Boolean(item.temporarySourceId),
  );
  const seen = new Set<string>();
  const uniqueJobs = candidates.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
  // eslint-disable-next-line unicorn/no-array-sort
  return uniqueJobs.sort((left, right) => dateValue(right.updatedAt) - dateValue(left.updatedAt));
}

export type TemporaryWorkFilter =
  | "all"
  | "active"
  | "generatedAudio"
  | "failed"
  | "expired"
  | "promoted";

export function filterTemporaryWorkSessions(
  sessions: readonly TemporarySourceSession[],
  filter: TemporaryWorkFilter,
): TemporarySourceSession[] {
  const filtered = sessions.filter((session) => {
    if (filter === "active") {
      return !["discarded", "expired", "promoted"].includes(session.status);
    }
    if (filter === "generatedAudio") {
      return hasTemporaryGeneratedAudio(session);
    }
    if (filter === "failed") {
      return session.status === "failed" || session.sourceReadiness?.state === "failed";
    }
    if (filter === "expired") {
      return session.status === "expired";
    }
    if (filter === "promoted") {
      return session.status === "promoted" || session.promotionStatus === "promoted";
    }
    return true;
  });
  // eslint-disable-next-line unicorn/no-array-sort
  return [...filtered].sort(
    (left, right) => dateValue(right.lastAccessedAt) - dateValue(left.lastAccessedAt),
  );
}

export function temporarySessionStorageUsage(
  session: TemporarySourceSession,
  usageSessions: readonly TemporaryStorageUsageSession[] = [],
): TemporaryStorageUsageSession | null {
  return (
    usageSessions.find(
      (usage) =>
        usage.temporarySourceId === session.id ||
        usage.temporarySourceId === session.temporarySourceId,
    ) ?? null
  );
}

export function temporarySessionAudioReadiness(
  session: TemporarySourceSession,
  jobs: readonly VoiceJob[] = [],
): string {
  const sessionJobs = jobs.filter(
    (item) =>
      item.temporarySourceId === session.id || item.temporarySourceId === session.temporarySourceId,
  );
  if (sessionJobs.some((item) => item.status === "failed")) {
    return "Failed";
  }
  if (sessionJobs.some((item) => isActiveJobStatus(item.status))) {
    return "Generating";
  }
  if (sessionJobs.some((item) => item.status === "completed")) {
    return "Ready";
  }
  if (hasTemporaryGeneratedAudio(session)) {
    return "Ready";
  }
  if (session.status === "generating") {
    return "Generating";
  }
  return "No audio";
}

export function commandCenterGeneratedAudioState(jobs: readonly VoiceJob[]): string {
  if (jobs.length === 0) {
    return "No audio";
  }
  if (jobs.some((item) => isActiveJobStatus(item.status))) {
    return "Working";
  }
  if (jobs.some((item) => item.status === "failed")) {
    return "Needs attention";
  }
  if (jobs.some((item) => item.status === "cancelled")) {
    return "Cancelled";
  }
  return `${jobs.filter((item) => item.status === "completed").length.toString()} ready`;
}

function isActiveJobStatus(status: string): boolean {
  return (
    status === "queued" ||
    status === "optimizing" ||
    status === "synthesizing" ||
    status === "checking" ||
    status === "retrying"
  );
}

function hasTemporaryGeneratedAudio(session: TemporarySourceSession): boolean {
  return session.artifacts.some(
    (artifact) => artifact.kind === "generatedAudio" || artifact.kind === "previewAudio",
  );
}

function dateValue(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
