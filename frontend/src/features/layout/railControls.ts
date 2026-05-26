import type { WorkspaceRailMode } from "../workspace/model";

export type CompactRailControlId = "playback" | "readiness" | "voice-cloning" | "voice-command";

export interface CompactRailControlMetadata {
  ariaLabel: string;
  collapsedState: WorkspaceRailMode;
  commandId: string;
  expandedState: WorkspaceRailMode;
  fullLabel: string;
  id: CompactRailControlId;
  shortcut?: string;
  tooltip: string;
  visibleLabel: string;
}

export interface RailModeControlMetadata {
  ariaLabel: (railLabel: string) => string;
  commandId: string;
  id: WorkspaceRailMode;
  tooltip: (railLabel: string) => string;
  visibleLabel: string;
}

export const COMPACT_RAIL_CONTROL_META: Record<CompactRailControlId, CompactRailControlMetadata> = {
  playback: {
    ariaLabel: "Expand Playback rail",
    collapsedState: "collapsed",
    commandId: "workspace:layout:balanced",
    expandedState: "compact",
    fullLabel: "Playback rail",
    id: "playback",
    tooltip: "Expand Playback rail to compact controls.",
    visibleLabel: "Play",
  },
  readiness: {
    ariaLabel: "Expand Readiness rail",
    collapsedState: "collapsed",
    commandId: "workspace:layout:balanced",
    expandedState: "compact",
    fullLabel: "Readiness rail",
    id: "readiness",
    tooltip: "Expand Readiness rail to compact status controls.",
    visibleLabel: "Ready",
  },
  "voice-cloning": {
    ariaLabel: "Expand Voice Cloning rail",
    collapsedState: "collapsed",
    commandId: "workspace:layout:balanced",
    expandedState: "compact",
    fullLabel: "Voice Cloning rail",
    id: "voice-cloning",
    tooltip: "Expand Voice Cloning rail to compact controls.",
    visibleLabel: "Clone",
  },
  "voice-command": {
    ariaLabel: "Expand Voice Command rail",
    collapsedState: "collapsed",
    commandId: "workspace:layout:balanced",
    expandedState: "compact",
    fullLabel: "Voice Command rail",
    id: "voice-command",
    tooltip: "Expand Voice Command rail to compact controls.",
    visibleLabel: "Voice",
  },
};

export const RAIL_MODE_CONTROL_META: Record<WorkspaceRailMode, RailModeControlMetadata> = {
  collapsed: {
    ariaLabel: (railLabel) => `Collapse ${railLabel} rail`,
    commandId: "workspace:layout:focus",
    id: "collapsed",
    tooltip: (railLabel) => `Collapse ${railLabel} rail for Focus layout.`,
    visibleLabel: "Hide",
  },
  compact: {
    ariaLabel: (railLabel) => `Set ${railLabel} rail to compact`,
    commandId: "workspace:layout:balanced",
    id: "compact",
    tooltip: (railLabel) => `Use compact ${railLabel} rail for Balanced layout.`,
    visibleLabel: "Slim",
  },
  full: {
    ariaLabel: (railLabel) => `Expand ${railLabel} rail fully`,
    commandId: "workspace:layout:full",
    id: "full",
    tooltip: (railLabel) => `Expand ${railLabel} rail for Full layout.`,
    visibleLabel: "Full",
  },
};

export function compactRailControlMeta(id: CompactRailControlId): CompactRailControlMetadata {
  return COMPACT_RAIL_CONTROL_META[id];
}

export function railModeControlMeta(mode: WorkspaceRailMode): RailModeControlMetadata {
  return RAIL_MODE_CONTROL_META[mode];
}
