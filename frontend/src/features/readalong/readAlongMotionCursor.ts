import type { ReaderAccessibilitySettings } from "../reader-accessibility";
import type { ReadAlongHighlightMotion } from "./readAlongPreferences";
import { markReadAlongPerformance } from "./readAlongPerformance";

export interface ReadAlongMotionCursorInput {
  accessibilitySettings?: Pick<ReaderAccessibilitySettings, "reducedMotion">;
  activeElement: HTMLElement | null;
  highlightMotion?: ReadAlongHighlightMotion;
  nextElement?: HTMLElement | null;
  root: ParentNode | null;
  transitionDurationMs?: number | null;
}

export interface ReadAlongMotionCursorState {
  cursor: HTMLElement | null;
  state: "idle" | "settling" | "gliding" | "fallback";
}

const MIN_CURSOR_DURATION_MS = 90;
const MAX_CURSOR_DURATION_MS = 420;
const LINE_CHANGE_THRESHOLD_PX = 5;
const CURSOR_PAD_X_PX = 3;
const CURSOR_PAD_Y_PX = 2;

export function updateReadAlongMotionCursor({
  accessibilitySettings,
  activeElement,
  highlightMotion,
  nextElement,
  root,
  transitionDurationMs,
}: Readonly<ReadAlongMotionCursorInput>): ReadAlongMotionCursorState {
  const rootElement = readAlongMotionElement(root);
  if (
    !rootElement ||
    !activeElement ||
    highlightMotion !== "smoothCursor" ||
    accessibilitySettings?.reducedMotion
  ) {
    clearReadAlongMotionCursor(root);
    return { cursor: null, state: "idle" };
  }

  const cursor = ensureReadAlongMotionCursor(rootElement);
  if (!cursor) {
    return { cursor: null, state: "idle" };
  }

  markReadAlongPerformance("motion-cursor-measure");
  const rootRect = rootElement.getBoundingClientRect();
  const activeRect = activeElement.getBoundingClientRect();
  const nextRect = nextElement?.getBoundingClientRect();
  const currentState = cursor.dataset.readalongMotionState;
  let state: ReadAlongMotionCursorState["state"] = "fallback";
  if (currentState === undefined || currentState === "idle") {
    state = "settling";
  } else if (nextRect && sameLine(activeRect, nextRect)) {
    state = "gliding";
  }
  const target = motionTargetForRect(activeRect, rootRect, rootElement);
  rootElement.dataset.readalongHighlightMotion = "smoothCursor";
  rootElement.dataset.readalongMotionRoot = "true";
  cursor.dataset.readalongMotionState = state;
  cursor.style.setProperty(
    "--readalong-motion-duration-ms",
    `${clampCursorDuration(transitionDurationMs).toString()}ms`,
  );
  cursor.style.opacity = "1";
  cursor.style.transform = `translate3d(${formatPx(target.x)}, ${formatPx(
    target.y,
  )}, 0) scale(${formatNumber(target.width)}, ${formatNumber(target.height)})`;
  markReadAlongPerformance("motion-cursor-update");
  return { cursor, state };
}

export function clearReadAlongMotionCursor(root: ParentNode | null | undefined): void {
  const rootElement = readAlongMotionElement(root);
  if (!rootElement) {
    return;
  }
  const cursor = findReadAlongMotionCursor(rootElement);
  if (cursor) {
    cursor.dataset.readalongMotionState = "idle";
    cursor.style.opacity = "0";
    cursor.remove();
  }
  delete rootElement.dataset.readalongMotionRoot;
  rootElement.dataset.readalongHighlightMotion = "static";
}

export function clampCursorDuration(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 180;
  }
  return Math.round(Math.min(MAX_CURSOR_DURATION_MS, Math.max(MIN_CURSOR_DURATION_MS, value)));
}

function ensureReadAlongMotionCursor(rootElement: HTMLElement): HTMLElement | null {
  const existing = findReadAlongMotionCursor(rootElement);
  if (existing) {
    return existing;
  }
  const cursor = rootElement.ownerDocument.createElement("span");
  cursor.setAttribute("aria-hidden", "true");
  cursor.dataset.readalongMotionCursor = "true";
  cursor.dataset.readalongMotionState = "idle";
  rootElement.append(cursor);
  return cursor;
}

function findReadAlongMotionCursor(rootElement: HTMLElement): HTMLElement | null {
  for (const child of rootElement.children) {
    const candidate = child as HTMLElement;
    if (candidate.dataset.readalongMotionCursor === "true") {
      return candidate;
    }
  }
  return null;
}

function motionTargetForRect(rect: DOMRect, rootRect: DOMRect, rootElement: HTMLElement) {
  return {
    height: Math.max(1, rect.height + CURSOR_PAD_Y_PX * 2),
    width: Math.max(1, rect.width + CURSOR_PAD_X_PX * 2),
    x: rect.left - rootRect.left + rootElement.scrollLeft - CURSOR_PAD_X_PX,
    y: rect.top - rootRect.top + rootElement.scrollTop - CURSOR_PAD_Y_PX,
  };
}

function sameLine(left: DOMRect, right: DOMRect): boolean {
  return Math.abs(left.top - right.top) <= LINE_CHANGE_THRESHOLD_PX;
}

function readAlongMotionElement(root: ParentNode | null | undefined): HTMLElement | null {
  if (!root) {
    return null;
  }
  if (typeof HTMLElement === "undefined") {
    return isMotionElementLike(root) ? (root as HTMLElement) : null;
  }
  return root instanceof HTMLElement ? root : null;
}

function isMotionElementLike(value: ParentNode): boolean {
  const candidate = value as Partial<HTMLElement>;
  return (
    typeof candidate.append === "function" &&
    Boolean(candidate.children) &&
    typeof candidate.getBoundingClientRect === "function" &&
    Boolean(candidate.dataset) &&
    Boolean(candidate.style)
  );
}

function formatPx(value: number): string {
  return `${formatNumber(value)}px`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const fixed = value.toFixed(2);
  if (fixed.endsWith(".00")) {
    return fixed.slice(0, -3);
  }
  return fixed.endsWith("0") ? fixed.slice(0, -1) : fixed;
}
