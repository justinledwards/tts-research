import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
  DEFAULT_WORKSPACE_DISCLOSURE_PINS,
} from "./features/workspace";
import { WorkspaceLayoutControl } from "./AppShell";

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
