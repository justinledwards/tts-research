export interface TelepromptFullscreenAvailability {
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

export function telepromptFullscreenAvailability(
  documentRef: Document | null | undefined = globalThis.document,
): TelepromptFullscreenAvailability {
  if (!documentRef) {
    return {
      reason: "Native fullscreen is unavailable in this runtime; Theatre Mode is available.",
      supported: false,
    };
  }
  const fullscreenDocument = documentRef as FullscreenDocument;
  const enabled = Boolean(
    fullscreenDocument.fullscreenEnabled || fullscreenDocument.webkitFullscreenEnabled,
  );
  if (!enabled) {
    return {
      reason:
        "Native fullscreen is unavailable in this browser or test runtime; Theatre Mode keeps the presenter view in the browser window.",
      supported: false,
    };
  }
  return { reason: null, supported: true };
}

export function isTelepromptFullscreenActive(
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

export async function requestTelepromptFullscreen(
  element: HTMLElement | null,
): Promise<"fullscreen" | "fallback"> {
  if (!element) {
    return "fallback";
  }
  const availability = telepromptFullscreenAvailability(element.ownerDocument);
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

export async function exitTelepromptFullscreen(
  documentRef: Document | null | undefined = globalThis.document,
): Promise<void> {
  if (!documentRef || !isTelepromptFullscreenActive(documentRef)) {
    return;
  }
  const fullscreenDocument = documentRef as FullscreenDocument;
  const exit =
    methodForFullscreen(fullscreenDocument, "exitFullscreen") ??
    methodForFullscreen(fullscreenDocument, "webkitExitFullscreen");
  await exit?.();
}

export function subscribeTelepromptFullscreenChange(
  documentRef: Document | null | undefined,
  callback: () => void,
): () => void {
  if (!documentRef) {
    return noopTelepromptFullscreenSubscription;
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

function noopTelepromptFullscreenSubscription(): void {
  return;
}
