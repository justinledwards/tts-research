import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
  DEFAULT_WORKSPACE_DISCLOSURE_PINS,
} from "./features/workspace";
import { TopProductBar, WorkspaceLayoutControl } from "./AppShell";
import { createRunConfiguration } from "./runConfig";
import type { VoiceJob, VoiceProject } from "./types";

describe("WorkspaceLayoutControl", () => {
  it("centralizes preset and custom pin controls in one menu", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutControl
        customLayout={DEFAULT_WORKSPACE_CUSTOM_LAYOUT}
        disclosurePins={DEFAULT_WORKSPACE_DISCLOSURE_PINS}
        layoutMode="balanced"
        onCustomLayoutChange={() => null}
        onDisclosurePinChange={() => null}
        onLayoutModeChange={() => null}
      />,
    );

    expect(markup).toContain('data-testid="ui-action-workspace-layout-menu"');
    expect(markup).toContain('aria-label="Focus workspace layout"');
    expect(markup).toContain('aria-label="Custom workspace layout"');
    expect(markup).toContain(
      'data-testid="ui-action-workspace-layout-custom-sourceContext-hidden"',
    );
    expect(markup).toContain(">Essential</button>");
    expect(markup).toContain('data-testid="ui-action-workspace-disclosure-pin-diagnostics"');
    expect(markup).toContain(">Auto</span>");
    expect(markup).not.toContain('data-segmented-control="Workspace layout"');
    expect(markup).not.toContain('data-segmented-control="rail-mode"');
  });
});

describe("TopProductBar", () => {
  it("keeps project and chapter switching while routing management to Command Center", () => {
    const markup = renderToStaticMarkup(
      <TopProductBar
        activeJobId="job-1"
        activeProjectId="project-1"
        canSubmit
        commandPaletteShortcutLabel="Ctrl+K"
        isProcessing={false}
        job={topBarJob()}
        jobName="Current chapter"
        projectJobs={[topBarJob()]}
        projectName="Novel"
        projects={[topBarProject()]}
        requestState="idle"
        runConfiguration={createRunConfiguration("checkedMaster")}
        settingsShortcutLabel="Ctrl+,"
        showSubmitAction={false}
        studioMode="narration"
        workspaceCustomLayout={DEFAULT_WORKSPACE_CUSTOM_LAYOUT}
        workspaceDisclosurePins={DEFAULT_WORKSPACE_DISCLOSURE_PINS}
        workspaceLayoutMode="balanced"
        onCancel={() => null}
        onCommandCenterOpen={() => null}
        onCommandPaletteOpen={() => null}
        onJobSelect={() => null}
        onProjectSelect={() => null}
        onSettingsOpen={() => null}
        onStudioModeChange={() => null}
        onSubmit={() => null}
        onWorkspaceCustomLayoutChange={() => null}
        onWorkspaceDisclosurePinChange={() => null}
        onWorkspaceLayoutModeChange={() => null}
      />,
    );

    expect(markup).toContain("Command Center");
    expect(markup).toContain('aria-label="Open Command Center"');
    expect(markup).toContain('aria-label="Select project"');
    expect(markup).toContain('aria-label="Select chapter"');
    expect(markup).not.toContain(">Import</button>");
    expect(markup).not.toContain(">Export</button>");
  });
});

function topBarProject(): VoiceProject {
  return {
    createdAt: "2026-05-31T20:00:00Z",
    id: "project-1",
    name: "Novel",
    updatedAt: "2026-05-31T21:00:00Z",
  } as VoiceProject;
}

function topBarJob(): VoiceJob {
  return {
    id: "job-1",
    inputText: "Opening chapter text",
    voice: "default",
    voiceProfileName: "Narrator",
  } as VoiceJob;
}
