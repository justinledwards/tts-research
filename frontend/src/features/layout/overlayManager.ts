import type { ActivityFooterMode } from "../../activityFooter";
import type { WorkspaceRailMode, WorkspaceStage } from "../workspace/model";

export const OVERLAY_SURFACE_OWNERS = [
  "preview-player",
  "activity-footer",
  "left-rail",
  "right-rail",
  "bottom-sheet",
  "command-palette",
  "settings-drawer",
  "context-panel",
  "cinema-transport",
] as const;

export type OverlaySurfaceOwner = (typeof OVERLAY_SURFACE_OWNERS)[number];

export const OVERLAY_RESERVED_ZONES = [
  "top-app-bar",
  "left-rail",
  "right-rail",
  "bottom-activity-footer",
  "floating-preview",
  "stage-inline-preview",
  "mobile-bottom-sheet",
  "command-palette",
  "settings-drawer",
  "context-panel",
] as const;

export type OverlayReservedZone = (typeof OVERLAY_RESERVED_ZONES)[number];

export type PreviewPlayerPlacement = "floating" | "inline" | "hidden";

export interface WorkspaceOverlayInput {
  readonly activityFooterMode: ActivityFooterMode;
  readonly previewPlayerVisible: boolean;
  readonly rightRailMode: WorkspaceRailMode;
  readonly stage: WorkspaceStage;
}

export interface WorkspaceOverlayState {
  readonly previewDock: "bottom" | "top";
  readonly previewPlacement: PreviewPlayerPlacement;
  readonly previewVariant: "compact" | "full";
  readonly reservedZones: readonly OverlayReservedZone[];
}

export function workspaceOverlayState(input: WorkspaceOverlayInput): WorkspaceOverlayState {
  const reservedZones: OverlayReservedZone[] = [
    "top-app-bar",
    "left-rail",
    "right-rail",
    "bottom-activity-footer",
  ];
  let previewPlacement: PreviewPlayerPlacement = "hidden";
  if (input.previewPlayerVisible) {
    previewPlacement =
      input.rightRailMode === "collapsed" && input.activityFooterMode === "collapsed"
        ? "floating"
        : "inline";
    if (previewPlacement === "floating") {
      reservedZones.push("floating-preview");
    }
  }
  const previewVariant = input.stage === "preview" ? "full" : "compact";
  return {
    previewDock: "bottom",
    previewPlacement,
    previewVariant,
    reservedZones,
  };
}

export function overlayDataAttributes(
  owner: OverlaySurfaceOwner,
  zone: OverlayReservedZone,
): Record<string, string> {
  return {
    "data-overlay-owner": owner,
    "data-overlay-zone": zone,
  };
}
