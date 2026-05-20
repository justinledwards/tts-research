export const NARROW_VIEWPORT_QUERY = "(max-width: 1023px)";
export const TOUCH_TARGET_MIN_PX = 44;

export const RESPONSIVE_QA_VIEWPORTS = {
  narrowDesktop: { height: 820, width: 1180 },
  phone: { height: 844, width: 390 },
  tabletLandscape: { height: 768, width: 1024 },
  tabletPortrait: { height: 1024, width: 768 },
} as const;

export type ResponsiveQaViewportName = keyof typeof RESPONSIVE_QA_VIEWPORTS;

export function isNarrowViewport(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia(NARROW_VIEWPORT_QUERY).matches
  );
}
