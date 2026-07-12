export type DashboardActionOwner =
  | "cinema"
  | "command-center"
  | "preview"
  | "runtime-diagnostics"
  | "settings"
  | "voice-dashboard";

export interface DashboardActionOwnership {
  readonly action: string;
  readonly owner: DashboardActionOwner;
  readonly reason: string;
}

export const DASHBOARD_ACTION_OWNERSHIP: readonly DashboardActionOwnership[] = [
  ownership("project.open", "command-center", "Open an existing project asset workspace."),
  ownership("project.create", "command-center", "Create a reusable project asset container."),
  ownership("project.rename", "command-center", "Rename a project asset."),
  ownership("project.delete", "command-center", "Delete a project after confirmation."),
  ownership("project.import", "command-center", "Import a project bundle."),
  ownership("project.export", "command-center", "Export the current project bundle."),
  ownership("project.protect", "command-center", "Explain protected project state."),
  ownership("source.list", "command-center", "List imported and prepared source assets."),
  ownership("project.status", "command-center", "Summarize project storage and generated assets."),
  ownership("voice.select", "voice-dashboard", "Select the reusable voice asset for future runs."),
  ownership("voice.create", "voice-dashboard", "Start the voice asset creation workflow."),
  ownership("voice.clone", "voice-dashboard", "Manage cloned voice targets and artifacts."),
  ownership("voice.delete", "voice-dashboard", "Delete saved voice assets after confirmation."),
  ownership("voice.import", "voice-dashboard", "Import a reusable voice asset bundle."),
  ownership("voice.export", "voice-dashboard", "Export a reusable voice asset bundle."),
  ownership("voice.readiness", "voice-dashboard", "Show reusable voice asset readiness."),
  ownership(
    "voice.diagnostics",
    "voice-dashboard",
    "Show voice-source and clone-target diagnostics.",
  ),
  ownership("configuration.run", "settings", "Configure behavior for the next run."),
  ownership(
    "configuration.scope",
    "settings",
    "Configure session, source, project, and machine scope.",
  ),
  ownership("preview.audition", "preview", "Audition temporary playback and A/B variants."),
  ownership(
    "preview.compare",
    "preview",
    "Compare voice, policy, and run variants before applying.",
  ),
  ownership("playback.full", "cinema", "Own full generated-audio playback."),
  ownership("runtime.readiness", "runtime-diagnostics", "Diagnose engine readiness and failures."),
] as const;

export function dashboardActionsForOwner(owner: DashboardActionOwner): DashboardActionOwnership[] {
  return DASHBOARD_ACTION_OWNERSHIP.filter((item) => item.owner === owner);
}

export function dashboardOwnerForAction(action: string): DashboardActionOwner | null {
  return DASHBOARD_ACTION_OWNERSHIP.find((item) => item.action === action)?.owner ?? null;
}

function ownership(
  action: string,
  owner: DashboardActionOwner,
  reason: string,
): DashboardActionOwnership {
  return { action, owner, reason };
}
