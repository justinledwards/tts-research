import {
  exitTheatreFullscreen,
  isTheatreFullscreenActive,
  requestTheatreFullscreen,
  subscribeTheatreFullscreenChange,
  theatreFullscreenAvailability,
  type TheatreFullscreenAvailability,
} from "../theatre/fullscreen";

export type TelepromptFullscreenAvailability = TheatreFullscreenAvailability;

const TELEPROMPT_FULLSCREEN_FALLBACK =
  "Theatre Mode keeps the presenter view in the browser window.";

export function telepromptFullscreenAvailability(
  documentRef: Document | null | undefined = globalThis.document,
): TelepromptFullscreenAvailability {
  return theatreFullscreenAvailability(documentRef, TELEPROMPT_FULLSCREEN_FALLBACK);
}

export function isTelepromptFullscreenActive(
  documentRef: Document | null | undefined = globalThis.document,
): boolean {
  return isTheatreFullscreenActive(documentRef);
}

export async function requestTelepromptFullscreen(
  element: HTMLElement | null,
): Promise<"fullscreen" | "fallback"> {
  return requestTheatreFullscreen(element, TELEPROMPT_FULLSCREEN_FALLBACK);
}

export async function exitTelepromptFullscreen(
  documentRef: Document | null | undefined = globalThis.document,
): Promise<void> {
  await exitTheatreFullscreen(documentRef);
}

export function subscribeTelepromptFullscreenChange(
  documentRef: Document | null | undefined,
  callback: () => void,
): () => void {
  return subscribeTheatreFullscreenChange(documentRef, callback);
}
