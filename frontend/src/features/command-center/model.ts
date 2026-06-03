import type { VoiceJob, VoiceProject } from "../../types";

export const COMMAND_CENTER_ROUTE_IDS = [
  "overview",
  "projects",
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
      "Use this surface for project-level actions, assets, activity, imports, exports, and reports. Closing returns to the current narration task.",
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
    ...(job?.projectId === activeProjectId ? [job] : []),
    ...projectJobs.filter((item) => item.projectId === activeProjectId),
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

function dateValue(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
