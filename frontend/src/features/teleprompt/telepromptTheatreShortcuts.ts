import {
  resolveTelepromptShortcut,
  type TelepromptKeyboardEventLike,
  type TelepromptShortcutAction,
} from "./telepromptToolbar";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  resolveShortcutCommandBinding,
  shouldIgnoreNarrationShortcutTarget,
  type ShortcutCommandId,
} from "../shortcuts/shortcutRegistry";

export type TelepromptTheatreShortcutAction =
  | TelepromptShortcutAction
  | "exitTheatre"
  | "jumpCurrentAudio"
  | "largeText"
  | "operatorPreview"
  | "toggleControls"
  | "toggleHighContrast"
  | "toggleMirror"
  | "toggleNativeFullscreen";

export function resolveTelepromptTheatreShortcut(
  event: TelepromptKeyboardEventLike,
): TelepromptTheatreShortcutAction | null {
  if (shouldIgnoreNarrationShortcutTarget(event.target ?? null)) {
    return null;
  }
  return (
    theatreActionForShortcutCommand(
      resolveShortcutCommandBinding(
        event as KeyboardEvent,
        DEFAULT_SHORTCUT_PREFERENCES,
        "theatre",
      ),
    ) ?? resolveTelepromptShortcut(event)
  );
}

function theatreActionForShortcutCommand(
  resolved: Readonly<{ bindingId: string; commandId: ShortcutCommandId }> | null,
): TelepromptTheatreShortcutAction | null {
  if (!resolved) {
    return null;
  }
  switch (resolved.commandId) {
    case "theatre.exit": {
      return "exitTheatre";
    }
    case "theatre.fullscreen": {
      return "toggleNativeFullscreen";
    }
    case "theatre.highContrast": {
      return "toggleHighContrast";
    }
    case "theatre.jumpCurrentAudio": {
      return "jumpCurrentAudio";
    }
    case "theatre.largeText": {
      return "largeText";
    }
    case "theatre.mirror": {
      return "toggleMirror";
    }
    case "theatre.nextCue": {
      return "nextCue";
    }
    case "theatre.operator": {
      return "operatorPreview";
    }
    case "theatre.playPause": {
      return "playPause";
    }
    case "theatre.previousCue": {
      return "previousCue";
    }
    case "theatre.restart": {
      return "restart";
    }
    case "theatre.speed": {
      return resolved.bindingId === "right-bracket" ? "speedUp" : "speedDown";
    }
    case "theatre.toggleControls": {
      return "toggleControls";
    }
    default: {
      return null;
    }
  }
}
