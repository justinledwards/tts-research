import {
  resolveTelepromptShortcut,
  type TelepromptKeyboardEventLike,
  type TelepromptShortcutAction,
} from "./telepromptToolbar";

export type TelepromptTheatreShortcutAction =
  | TelepromptShortcutAction
  | "exitTheatre"
  | "jumpCurrentAudio"
  | "largeText"
  | "operatorPreview"
  | "toggleHighContrast"
  | "toggleMirror"
  | "toggleNativeFullscreen";

export function resolveTelepromptTheatreShortcut(
  event: TelepromptKeyboardEventLike,
): TelepromptTheatreShortcutAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === "escape") {
    return "exitTheatre";
  }
  if (key === "f") {
    return "toggleNativeFullscreen";
  }
  if (key === "m") {
    return "toggleMirror";
  }
  if (key === "o") {
    return "operatorPreview";
  }
  if (key === "j") {
    return "jumpCurrentAudio";
  }
  if (key === "l") {
    return "largeText";
  }
  if (key === "h") {
    return "toggleHighContrast";
  }
  return resolveTelepromptShortcut(event);
}
