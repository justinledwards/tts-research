export interface TheatreFullscreenAvailability {
  readonly reason: string | null;
  readonly supported: boolean;
}

type FullscreenDocument = Document & {
  readonly webkitFullscreenElement?: Element | null;
  readonly webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function theatreFullscreenAvailability(
  documentRef: Document | null | undefined = globalThis.document,
  fallbackDescription = "Theatre Mode stays available inside the browser window.",
): TheatreFullscreenAvailability {
  if (!documentRef) {
    return {
      reason: `Native fullscreen is unavailable in this runtime; ${fallbackDescription}`,
      supported: false,
    };
  }
  const fullscreenDocument = documentRef as FullscreenDocument;
  const enabled = Boolean(
    fullscreenDocument.fullscreenEnabled || fullscreenDocument.webkitFullscreenEnabled,
  );
  if (!enabled) {
    return {
      reason: `Native fullscreen is unavailable in this browser or test runtime; ${fallbackDescription}`,
      supported: false,
    };
  }
  return { reason: null, supported: true };
}

export function isTheatreFullscreenActive(
  documentRef: Document | null | undefined = globalThis.document,
): boolean {
  if (!documentRef) {
    return false;
  }
  const fullscreenDocument = documentRef as FullscreenDocument;
  return Boolean(
    fullscreenDocument.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null,
  );
}

export async function requestTheatreFullscreen(
  element: HTMLElement | null,
  fallbackDescription?: string,
): Promise<"fullscreen" | "fallback"> {
  if (!element) {
    return "fallback";
  }
  const availability = theatreFullscreenAvailability(element.ownerDocument, fallbackDescription);
  if (!availability.supported) {
    return "fallback";
  }
  const fullscreenElement = element as FullscreenElement;
  const request =
    methodForFullscreen(fullscreenElement, "requestFullscreen") ??
    methodForFullscreen(fullscreenElement, "webkitRequestFullscreen");
  if (!request) {
    return "fallback";
  }
  await request();
  return "fullscreen";
}

export async function exitTheatreFullscreen(
  documentRef: Document | null | undefined = globalThis.document,
): Promise<void> {
  if (!documentRef || !isTheatreFullscreenActive(documentRef)) {
    return;
  }
  const fullscreenDocument = documentRef as FullscreenDocument;
  const exit =
    methodForFullscreen(fullscreenDocument, "exitFullscreen") ??
    methodForFullscreen(fullscreenDocument, "webkitExitFullscreen");
  await exit?.();
}

export function subscribeTheatreFullscreenChange(
  documentRef: Document | null | undefined,
  callback: () => void,
): () => void {
  if (!documentRef) {
    return noopTheatreFullscreenSubscription;
  }
  documentRef.addEventListener("fullscreenchange", callback);
  documentRef.addEventListener("webkitfullscreenchange", callback);
  return () => {
    documentRef.removeEventListener("fullscreenchange", callback);
    documentRef.removeEventListener("webkitfullscreenchange", callback);
  };
}

function methodForFullscreen(
  target: object,
  methodName: string,
): (() => Promise<void> | void) | null {
  const candidate = Reflect.get(target, methodName) as unknown;
  return typeof candidate === "function"
    ? (candidate.bind(target) as () => Promise<void> | void)
    : null;
}

function noopTheatreFullscreenSubscription(): void {
  return;
}
