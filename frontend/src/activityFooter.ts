export type ActivityFooterMode = "full" | "compact" | "collapsed";

export const ACTIVITY_FOOTER_MODE_STORAGE_KEY = "tts-activity-footer-mode";

export function normalizeActivityFooterMode(value: unknown): ActivityFooterMode {
  if (value === "full" || value === "compact" || value === "collapsed") {
    return value;
  }
  return "full";
}

export function defaultActivityFooterMode(): ActivityFooterMode {
  if (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(max-width: 1023px)").matches
  ) {
    return "compact";
  }
  return "full";
}

export function nextActivityFooterMode(mode: ActivityFooterMode): ActivityFooterMode {
  if (mode === "full") {
    return "compact";
  }
  if (mode === "compact") {
    return "collapsed";
  }
  return "full";
}
