import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
  DEFAULT_WORKSPACE_DISCLOSURE_PINS,
} from "./features/workspace";
import { TopProductBar, WorkspaceLayoutControl } from "./AppShell";
import { createRunConfiguration } from "./runConfig";

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
    expect(markup).toContain(">Compact</button>");
    expect(markup).toContain(">Expanded</button>");
    expect(markup).toContain('data-testid="ui-action-workspace-disclosure-pin-diagnostics"');
    expect(markup).toContain(">Auto</span>");
    expect(markup).toContain("Custom layout");
    expect(markup).not.toContain('data-segmented-control="Workspace layout"');
    expect(markup).not.toContain('data-segmented-control="rail-mode"');
    expect(markup).not.toContain(">Hidden</button>");
    expect(markup).not.toContain(">Hide</button>");
    expect(markup).not.toContain(">Slim</button>");
    expect(markup).not.toContain(">Less</button>");
  });
});

describe("TopProductBar", () => {
  it("keeps project and chapter switching while routing management to Command Center", () => {
    const markup = renderToStaticMarkup(
      <TopProductBar
        commandPaletteShortcutLabel="Ctrl+K"
        runConfiguration={createRunConfiguration("checkedMaster")}
        settingsShortcutLabel="Ctrl+,"
        studioMode="narration"
        workContext={{
          chapterName: "Current chapter",
          projectName: "Novel",
          workspaceLabel: "Narration Workbench",
        }}
        workspaceCustomLayout={DEFAULT_WORKSPACE_CUSTOM_LAYOUT}
        workspaceDisclosurePins={DEFAULT_WORKSPACE_DISCLOSURE_PINS}
        workspaceLayoutMode="balanced"
        onCommandCenterOpen={() => null}
        onCommandPaletteOpen={() => null}
        onSettingsOpen={() => null}
        onStudioModeChange={() => null}
        onWorkspaceCustomLayoutChange={() => null}
        onWorkspaceDisclosurePinChange={() => null}
        onWorkspaceLayoutModeChange={() => null}
      />,
    );

    expect(markup.match(/Command Center/g)?.length).toBe(1);
    expect(markup).toContain('aria-label="Open Command Center"');
    expect(markup).not.toContain('data-testid="ui-action-workspace-open"');
    expect(markup).toContain('data-testid="ui-action-shell-context-summary"');
    expect(markup).toContain(">Work</span>");
    expect(markup).toContain("Narration Workbench");
    expect(markup).toContain("Novel");
    expect(markup).toContain("Current chapter");
    expect(markup).toContain('data-segmented-control="Studio mode"');
    expect(markup).toContain("Layout");
    expect(markup).toContain('aria-label="Open settings"');
    expect(markup).not.toContain('aria-label="Select project"');
    expect(markup).not.toContain('aria-label="Select chapter"');
    expect(markup).not.toContain(">Import</button>");
    expect(markup).not.toContain(">Export</button>");
    expect(markup).not.toContain("Cancel Job");
    expect(markup).not.toContain("Create &amp; Listen");
    expect(markup).not.toContain(">Run</button>");
    expect(markup).not.toContain("Cancelled");
    expect(markup).not.toContain("Failed");
    expect(markup).not.toContain("Generating");
    expect(markup).not.toContain(">idle</");
  });
});
