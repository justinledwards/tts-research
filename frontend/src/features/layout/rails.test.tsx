import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildWorkspaceCommandMetadata } from "../navigation";
import {
  COMPACT_RAIL_CONTROL_META,
  CompactRailToggle,
  RAIL_MODE_CONTROL_META,
  RailModeToolbar,
} from "./index";

describe("compact rail controls", () => {
  it("keeps collapsed rail toggles readable and linked to command metadata", () => {
    const workspaceCommandIds = new Set(
      buildWorkspaceCommandMetadata().map((command) => command.id),
    );

    for (const meta of Object.values(COMPACT_RAIL_CONTROL_META)) {
      expect(meta.visibleLabel.length).toBeGreaterThan(1);
      expect(meta.tooltip).toContain(meta.fullLabel);
      expect(meta.ariaLabel).toContain(meta.fullLabel.replace(" rail", ""));
      expect(workspaceCommandIds.has(meta.commandId)).toBe(true);
    }
  });

  it("renders a collapsed rail toggle with tooltip, state metadata, and non-letter label", () => {
    const markup = renderToStaticMarkup(
      <CompactRailToggle controlId="voice-command" onExpand={() => null} />,
    );

    expect(markup).toContain('aria-label="Expand Voice Command rail"');
    expect(markup).toContain('title="Expand Voice Command rail to compact controls."');
    expect(markup).toContain('data-compact-control="rail-toggle"');
    expect(markup).toContain('data-command-id="workspace:layout:balanced"');
    expect(markup).toContain('data-collapsed-state="collapsed"');
    expect(markup).toContain('data-expanded-state="compact"');
    expect(markup).toContain(">Voice</span>");
    expect(markup).not.toContain(">V</span>");
  });

  it("renders rail mode toolbar options with unclipped labels and command ids", () => {
    const markup = renderToStaticMarkup(
      <RailModeToolbar label="Playback" mode="compact" onModeChange={() => null} />,
    );

    for (const meta of Object.values(RAIL_MODE_CONTROL_META)) {
      expect(meta.visibleLabel.length).toBeGreaterThan(1);
      expect(markup).toContain(`data-command-id="${meta.commandId}"`);
      expect(markup).toContain(`>${meta.visibleLabel}</button>`);
    }
    expect(markup).toContain('data-segmented-control="rail-mode"');
    expect(markup).toContain('aria-label="Set Playback rail to compact"');
  });
});
