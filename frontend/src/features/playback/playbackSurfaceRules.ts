import type { WorkspaceStage } from "../workspace";
import type { PlaybackOwner } from "./playbackOwner";

export interface PlaybackSurfaceState {
  readonly activityFooterMode?: "collapsed" | "compact" | "full";
  readonly isCinemaOpen?: boolean;
  readonly isSettingsOpen?: boolean;
  readonly owner: PlaybackOwner;
  readonly preparedSourceCinemaOpen?: boolean;
  readonly stage: WorkspaceStage;
}

export function shouldShowGlobalPreviewPlayer(state: PlaybackSurfaceState): boolean {
  if (state.isCinemaOpen || state.preparedSourceCinemaOpen) {
    return false;
  }
  if (state.stage === "preview" || state.stage === "teleprompt" || state.stage === "theatre") {
    return false;
  }
  if (state.stage === "intake") {
    return false;
  }
  if (state.owner === "cinema" || state.owner === "teleprompt") {
    return false;
  }
  if (state.activityFooterMode === "full") {
    return false;
  }
  return true;
}

export function previewPlayerVariantForSurface(
  state: Pick<PlaybackSurfaceState, "isSettingsOpen" | "stage">,
): "compact" | "full" {
  return state.stage === "preview" || state.isSettingsOpen ? "full" : "compact";
}

export function shouldShowRailCinemaShortcut(stage: WorkspaceStage): boolean {
  return stage !== "preview" && stage !== "teleprompt" && stage !== "theatre" && stage !== "review";
}

export function telepromptSecondaryActionVariant(
  action: "create-and-listen" | "open-cinema",
): "ghost" | "soft" {
  return action === "create-and-listen" ? "soft" : "ghost";
}
