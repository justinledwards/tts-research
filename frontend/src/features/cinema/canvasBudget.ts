import type { CinemaFocusMode } from "./model";

export type CinemaCanvasBudgetKind = "read" | "read-pinned" | "inspect" | "review" | "debug";

export interface CinemaCanvasBudget {
  compactMinCanvasHeightRatio: number;
  desktopFooterMaxHeightPx: number;
  desktopFooterMaxHeightRatio: number;
  footerMaxHeightPx: number;
  footerMaxHeightRatio: number;
  kind: CinemaCanvasBudgetKind;
  minCanvasHeightRatio: number;
  minCanvasWidthRatio: number;
}

interface CinemaCanvasBudgetInput {
  canvasFirst: boolean;
  focusMode: string;
  hasInspector: boolean;
}

const CINEMA_CANVAS_BUDGETS: Record<CinemaCanvasBudgetKind, CinemaCanvasBudget> = {
  debug: {
    compactMinCanvasHeightRatio: 0.42,
    desktopFooterMaxHeightPx: 172,
    desktopFooterMaxHeightRatio: 0.22,
    footerMaxHeightPx: 204,
    footerMaxHeightRatio: 0.27,
    kind: "debug",
    minCanvasHeightRatio: 0.46,
    minCanvasWidthRatio: 0.55,
  },
  inspect: {
    compactMinCanvasHeightRatio: 0.44,
    desktopFooterMaxHeightPx: 164,
    desktopFooterMaxHeightRatio: 0.2,
    footerMaxHeightPx: 196,
    footerMaxHeightRatio: 0.26,
    kind: "inspect",
    minCanvasHeightRatio: 0.5,
    minCanvasWidthRatio: 0.56,
  },
  read: {
    compactMinCanvasHeightRatio: 0.43,
    desktopFooterMaxHeightPx: 136,
    desktopFooterMaxHeightRatio: 0.17,
    footerMaxHeightPx: 188,
    footerMaxHeightRatio: 0.25,
    kind: "read",
    minCanvasHeightRatio: 0.58,
    minCanvasWidthRatio: 0.9,
  },
  "read-pinned": {
    compactMinCanvasHeightRatio: 0.44,
    desktopFooterMaxHeightPx: 144,
    desktopFooterMaxHeightRatio: 0.18,
    footerMaxHeightPx: 196,
    footerMaxHeightRatio: 0.26,
    kind: "read-pinned",
    minCanvasHeightRatio: 0.54,
    minCanvasWidthRatio: 0.56,
  },
  review: {
    compactMinCanvasHeightRatio: 0.44,
    desktopFooterMaxHeightPx: 164,
    desktopFooterMaxHeightRatio: 0.2,
    footerMaxHeightPx: 196,
    footerMaxHeightRatio: 0.26,
    kind: "review",
    minCanvasHeightRatio: 0.5,
    minCanvasWidthRatio: 0.56,
  },
};

export function cinemaCanvasBudgetFor({
  canvasFirst,
  focusMode,
  hasInspector,
}: CinemaCanvasBudgetInput): CinemaCanvasBudget {
  if (canvasFirst) {
    return hasInspector ? CINEMA_CANVAS_BUDGETS["read-pinned"] : CINEMA_CANVAS_BUDGETS.read;
  }
  if (isCinemaCanvasBudgetFocusMode(focusMode)) {
    return CINEMA_CANVAS_BUDGETS[focusMode];
  }
  return CINEMA_CANVAS_BUDGETS.inspect;
}

export function cinemaCanvasBudgetDataAttributes(
  budget: CinemaCanvasBudget,
): Record<string, string> {
  return {
    "data-cinema-canvas-budget": budget.kind,
    "data-cinema-compact-min-canvas-height-ratio": String(budget.compactMinCanvasHeightRatio),
    "data-cinema-desktop-footer-max-height-px": String(budget.desktopFooterMaxHeightPx),
    "data-cinema-desktop-footer-max-height-ratio": String(budget.desktopFooterMaxHeightRatio),
    "data-cinema-footer-max-height-px": String(budget.footerMaxHeightPx),
    "data-cinema-footer-max-height-ratio": String(budget.footerMaxHeightRatio),
    "data-cinema-min-canvas-height-ratio": String(budget.minCanvasHeightRatio),
    "data-cinema-min-canvas-width-ratio": String(budget.minCanvasWidthRatio),
  };
}

function isCinemaCanvasBudgetFocusMode(value: string): value is Exclude<CinemaFocusMode, "read"> {
  return value === "inspect" || value === "review" || value === "debug";
}
