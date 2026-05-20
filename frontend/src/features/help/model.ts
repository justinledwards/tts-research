import type { RunConfiguration } from "../../runConfig";
import type { VoiceJob, VoiceProfileSource } from "../../types";
import type { StudioMode } from "../../AppShell";
import type { WorkspaceStage } from "../workspace/model";

export type HelpAnchorId = "intake" | "review" | "preview" | "teleprompt" | "run" | "cinema";
export type HelpSourceMode = "book" | "fileUrl" | "text";

export interface HelpAnchor {
  detail: string;
  id: HelpAnchorId;
  label: string;
}

export interface HelpWorkflowContext {
  activeCinema?: "book" | "prepared" | null;
  runConfiguration: RunConfiguration;
  sourceMode: HelpSourceMode;
  stage: WorkspaceStage;
  studioMode: StudioMode;
}

export const HELP_ANCHORS: HelpAnchor[] = [
  {
    detail: "Add text, books, files, or URLs.",
    id: "intake",
    label: "Intake",
  },
  {
    detail: "Check source blocks and listener text.",
    id: "review",
    label: "Review",
  },
  {
    detail: "Confirm the spoken form before creating audio.",
    id: "preview",
    label: "Preview",
  },
  {
    detail: "Follow the script with preserved context.",
    id: "teleprompt",
    label: "Teleprompt",
  },
  {
    detail: "Create, check, retry, or publish audio.",
    id: "run",
    label: "Run",
  },
  {
    detail: "Read, inspect, review, and use advanced diagnostics for generated sources.",
    id: "cinema",
    label: "Cinema",
  },
];

export function resolveActiveHelpAnchor(context: HelpWorkflowContext): HelpAnchorId {
  if (context.activeCinema) {
    return "cinema";
  }
  if (context.studioMode === "voiceCloning") {
    return "run";
  }
  if (context.stage === "teleprompt") {
    return "teleprompt";
  }
  if (context.stage === "preview") {
    return "preview";
  }
  if (context.stage === "review") {
    return "review";
  }
  return "intake";
}

export function explainCurrentState(
  job: VoiceJob | null,
  source: VoiceProfileSource | null,
): string {
  if (job?.status === "failed") {
    return job.error ?? "The current job failed. Open Settings for provider diagnostics.";
  }
  if (job?.status === "cancelled") {
    return "The narration run was cancelled. The app is idle and ready for the next run.";
  }
  if (job && job.status !== "completed") {
    return `${job.progress.message || "The job is running."} ${job.progress.detail || ""}`.trim();
  }
  if (source?.status === "failed") {
    return source.error ?? "Source analysis failed before candidates were ready.";
  }
  if (source?.status === "cancelled") {
    return "Source analysis was cancelled. The app is idle and ready for the next source.";
  }
  if (source && source.status !== "ready") {
    return source.progressMessage || "Source analysis is preparing candidate voices.";
  }
  if (job?.status === "completed") {
    return "Completed audio is ready. Use Cinema for reading review or Create Again for a fresh run.";
  }
  return "Add or choose a source, then review its listener form before creating audio.";
}
