import {
  readAlongHighlightClassName,
  type ReadAlongHighlightSurface,
  type ReadAlongHighlightVisualMode,
} from "./highlightVisualModes";
import type {
  ReadAlongHighlightMotion,
  ReadAlongHighlightStyle,
  ReadAlongScrollFollow,
} from "./readAlongPreferences";
import type { ReaderAccessibilitySettings } from "../reader-accessibility";
import { markReadAlongPerformance, startReadAlongLongTaskObserver } from "./readAlongPerformance";
import { readAlongAnchorForWord, resolveReadAlongDomAnchor } from "./domAnchorResolver";
import { clearReadAlongMotionCursor, updateReadAlongMotionCursor } from "./readAlongMotionCursor";
import { resolveReadAlongScrollPolicy } from "./scrollFollowPolicy";
import type { WordTimeline, WordTimelineEntry } from "./wordTimeline";

export interface ReadAlongWordSchedulerRuntime {
  clearTimeout: (id: number) => void;
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => number;
}

export interface ReadAlongWordSchedulerOptions {
  audioElement: () => HTMLAudioElement | null;
  canClaimExactReadAlong?: boolean | null;
  highlight?: ReadAlongDomHighlighterOptions;
  initialCursorSec?: number;
  onWordChange?: (entry: WordTimelineEntry, cursorSec: number) => void;
  runtime?: ReadAlongWordSchedulerRuntime;
  timeline: WordTimeline | null | undefined;
}

export interface ReadAlongDomHighlighterOptions {
  accessibilitySettings?: Pick<ReaderAccessibilitySettings, "reducedMotion">;
  autoFollow?: boolean;
  highlightMotion?: ReadAlongHighlightMotion;
  highlightStyle?: ReadAlongHighlightStyle;
  mode: ReadAlongHighlightVisualMode;
  root: () => ParentNode | null;
  scrollFollow?: ReadAlongScrollFollow;
  sourceId?: string;
  surface: ReadAlongHighlightSurface;
}

export interface ReadAlongDomHighlightState {
  activeElement: HTMLElement | null;
  activeWordIndex: number | null;
}

export interface ReadAlongDomHighlightMotionInput {
  nextEntry?: WordTimelineEntry | null;
  transitionDurationMs?: number | null;
}

const MIN_TIMEOUT_DELAY_MS = 8;
const PREVIOUS_ACTIVE_WORD_SELECTOR = [
  '[data-readalong-dom-active="true"]',
  '[aria-current="true"][data-readalong-word-index]',
  ".book-cinema-word-active",
  ".website-cinema-word-active",
].join(",");

const WORD_ROLE_CLASSES = [
  "readalong-word-role--idle",
  "readalong-word-role--spoken",
  "readalong-word-role--recent",
  "readalong-word-role--active",
  "readalong-word-role--activePhrase",
  "readalong-word-role--upcoming",
  "readalong-word-role--skipped",
  "readalong-word-role--transformed",
] as const;

export class ReadAlongWordScheduler {
  private activeIndex: number | null = null;
  private cleanupAudioListeners: (() => void) | null = null;
  private readonly highlighter = new ReadAlongDomHighlighterSession();
  private readonly options: ReadAlongWordSchedulerOptions;
  private readonly runtime: ReadAlongWordSchedulerRuntime;
  private timeoutId: number | null = null;

  constructor(options: ReadAlongWordSchedulerOptions) {
    this.options = options;
    this.runtime = options.runtime ?? browserWordSchedulerRuntime();
  }

  start(): void {
    startReadAlongLongTaskObserver();
    this.stop(false);
    const audio = this.options.audioElement();
    if (!this.canClaimExactReadAlong()) {
      if (this.options.highlight) {
        this.highlighter.clear(this.options.highlight);
      }
      return;
    }
    if (!audio || !this.options.timeline?.entries.length) {
      return;
    }
    this.cleanupAudioListeners = bindSchedulerAudioEvents(audio, () => {
      this.syncNow();
    });
    this.syncNow();
  }

  stop(clearHighlight = true): void {
    this.clearTimer();
    this.cleanupAudioListeners?.();
    this.cleanupAudioListeners = null;
    this.activeIndex = null;
    if (clearHighlight && this.options.highlight) {
      this.highlighter.clear(this.options.highlight);
    }
  }

  syncNow(): void {
    this.clearTimer();
    if (!this.canClaimExactReadAlong()) {
      return;
    }
    const entries = this.options.timeline?.entries ?? [];
    if (entries.length === 0) {
      return;
    }
    const audio = this.options.audioElement();
    const cursorSec =
      audio && Number.isFinite(audio.currentTime)
        ? Math.max(0, audio.currentTime)
        : (this.options.initialCursorSec ?? 0);
    const cursorMs = cursorSec * 1000;
    const nextIndex = resolveWordTimelineIndex(entries, cursorMs);
    const activeEntry = entries[nextIndex];
    if (this.activeIndex !== nextIndex) {
      this.activeIndex = nextIndex;
      markReadAlongPerformance("word-resolve");
      if (this.options.highlight) {
        this.highlighter.apply(this.options.highlight, activeEntry, {
          nextEntry: entries[nextIndex + 1] ?? null,
          transitionDurationMs: durationUntilNextBoundaryMs(entries, nextIndex, cursorMs, audio),
        });
      }
      this.options.onWordChange?.(activeEntry, cursorSec);
    }
    this.scheduleNext(entries, nextIndex, cursorMs, audio);
  }

  private scheduleNext(
    entries: readonly WordTimelineEntry[],
    activeIndex: number,
    cursorMs: number,
    audio: HTMLAudioElement | null,
  ): void {
    if (audio?.paused) {
      return;
    }
    const boundaryMs = nextWordBoundaryMs(entries, activeIndex, cursorMs);
    if (boundaryMs === null) {
      return;
    }
    const playbackRate =
      audio && Number.isFinite(audio.playbackRate) && audio.playbackRate > 0
        ? audio.playbackRate
        : 1;
    const delayMs = Math.max(MIN_TIMEOUT_DELAY_MS, (boundaryMs - cursorMs) / playbackRate);
    this.timeoutId = this.runtime.setTimeout(() => {
      this.timeoutId = null;
      this.syncNow();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timeoutId === null) {
      return;
    }
    this.runtime.clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }

  private canClaimExactReadAlong(): boolean {
    return this.options.canClaimExactReadAlong === true;
  }
}

export function applyReadAlongDomHighlight(
  options: ReadAlongDomHighlighterOptions,
  entry: WordTimelineEntry,
  motion: ReadAlongDomHighlightMotionInput = {},
): ReadAlongDomHighlightState {
  return new ReadAlongDomHighlighterSession().apply(options, entry, motion);
}

export function clearReadAlongDomHighlight(options: ReadAlongDomHighlighterOptions): void {
  const root = options.root();
  if (!root) {
    return;
  }
  const active = root.querySelectorAll<HTMLElement>('[data-readalong-dom-active="true"]');
  for (const element of active) {
    deactivateReadAlongWordElement(element);
  }
  clearReadAlongMotionCursor(root);
}

export class ReadAlongDomHighlighterSession {
  private activeElement: HTMLElement | null = null;
  private readonly elementCache = new Map<string, HTMLElement>();
  private root: ParentNode | null = null;
  private rootKey = "";

  apply(
    options: ReadAlongDomHighlighterOptions,
    entry: WordTimelineEntry,
    motion: ReadAlongDomHighlightMotionInput = {},
  ): ReadAlongDomHighlightState {
    const root = options.root();
    if (!root || options.mode !== "word") {
      clearReadAlongMotionCursor(root);
      this.reset(null, "");
      return { activeElement: null, activeWordIndex: null };
    }
    this.prepareRoot(root, options);
    const wordElement = this.resolveWordElement(root, options, entry);
    if (!wordElement) {
      this.deactivateActiveElement();
      updateReadAlongMotionCursor({
        accessibilitySettings: options.accessibilitySettings,
        activeElement: null,
        highlightMotion: options.highlightMotion,
        root,
      });
      return { activeElement: null, activeWordIndex: entry.sourceWordIndex };
    }
    if (this.activeElement === wordElement) {
      activateReadAlongWordElement(wordElement, options);
    } else {
      this.deactivateActiveElement();
      activateReadAlongWordElement(wordElement, options);
      this.activeElement = wordElement;
      maybeScrollReadAlongDomHighlight(wordElement, options);
    }
    const nextElement =
      options.highlightMotion === "smoothCursor" && motion.nextEntry
        ? this.resolveWordElement(root, options, motion.nextEntry)
        : null;
    updateReadAlongMotionCursor({
      accessibilitySettings: options.accessibilitySettings,
      activeElement: wordElement,
      highlightMotion: options.highlightMotion,
      nextElement,
      root,
      transitionDurationMs: motion.transitionDurationMs,
    });
    markReadAlongPerformance("dom-highlight-swap");
    return { activeElement: wordElement, activeWordIndex: entry.sourceWordIndex };
  }

  clear(options?: ReadAlongDomHighlighterOptions): void {
    const root = options?.root() ?? this.root;
    if (root) {
      this.clearRoot(root);
      clearReadAlongMotionCursor(root);
    }
    this.reset(null, "");
  }

  private prepareRoot(root: ParentNode, options: ReadAlongDomHighlighterOptions): void {
    const nextRootKey = readAlongHighlighterRootKey(options);
    if (this.root === root && this.rootKey === nextRootKey) {
      return;
    }
    if (this.root && this.root !== root) {
      this.clearRoot(this.root);
      clearReadAlongMotionCursor(this.root);
    }
    this.reset(root, nextRootKey);
    this.clearRoot(root);
  }

  private clearRoot(root: ParentNode): void {
    this.deactivateActiveElement();
    const active = root.querySelectorAll<HTMLElement>(PREVIOUS_ACTIVE_WORD_SELECTOR);
    for (const element of active) {
      deactivateReadAlongWordElement(element);
    }
  }

  private deactivateActiveElement(): void {
    if (!this.activeElement) {
      return;
    }
    deactivateReadAlongWordElement(this.activeElement);
    this.activeElement = null;
  }

  private resolveWordElement(
    root: ParentNode,
    options: ReadAlongDomHighlighterOptions,
    entry: WordTimelineEntry,
  ): HTMLElement | null {
    const cacheKey = readAlongWordElementCacheKey(options, entry);
    const cached = this.elementCache.get(cacheKey);
    if (cached && isCachedReadAlongElementUsable(root, cached)) {
      markReadAlongPerformance("dom-anchor-cache-hit");
      return cached;
    }
    if (cached) {
      this.elementCache.delete(cacheKey);
    }
    markReadAlongPerformance("dom-anchor-resolve");
    const element = resolveReadAlongWordElement(root, options, entry);
    if (element) {
      this.elementCache.set(cacheKey, element);
    }
    return element;
  }

  private reset(root: ParentNode | null, rootKey: string): void {
    this.activeElement = null;
    this.elementCache.clear();
    this.root = root;
    this.rootKey = rootKey;
  }
}

export function resolveWordTimelineIndex(
  entries: readonly WordTimelineEntry[],
  cursorMs: number,
): number {
  if (entries.length === 0) {
    return -1;
  }
  const safeCursor = Math.max(0, cursorMs);
  let low = 0;
  let high = entries.length - 1;
  let closestBefore = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const entry = entries[mid];
    if (safeCursor < entry.audioStartMs) {
      high = mid - 1;
    } else if (safeCursor >= entry.audioEndMs) {
      closestBefore = mid;
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return closestBefore;
}

export function nextWordBoundaryMs(
  entries: readonly WordTimelineEntry[],
  activeIndex: number,
  cursorMs: number,
): number | null {
  if (entries.length === 0) {
    return null;
  }
  const active = entries[Math.max(0, Math.min(activeIndex, entries.length - 1))];
  if (cursorMs < active.audioStartMs) {
    return active.audioStartMs;
  }
  const nextIndex = activeIndex + 1;
  if (nextIndex >= entries.length) {
    return null;
  }
  return Math.max(cursorMs + MIN_TIMEOUT_DELAY_MS, entries[nextIndex].audioStartMs);
}

function durationUntilNextBoundaryMs(
  entries: readonly WordTimelineEntry[],
  activeIndex: number,
  cursorMs: number,
  audio: HTMLAudioElement | null,
): number | null {
  const boundaryMs = nextWordBoundaryMs(entries, activeIndex, cursorMs);
  if (boundaryMs === null) {
    return null;
  }
  const playbackRate =
    audio && Number.isFinite(audio.playbackRate) && audio.playbackRate > 0 ? audio.playbackRate : 1;
  return Math.max(MIN_TIMEOUT_DELAY_MS, (boundaryMs - cursorMs) / playbackRate);
}

function resolveReadAlongWordElement(
  root: ParentNode,
  options: ReadAlongDomHighlighterOptions,
  entry: WordTimelineEntry,
): HTMLElement | null {
  const element = resolveReadAlongDomAnchor(
    root,
    readAlongAnchorForWord({
      fallbackTextQuote: entry.text,
      nodeId: entry.anchorNodeId,
      sourceId: options.sourceId,
      tokenOffset: entry.anchorTokenOffset,
      wordIndex: readAlongAnchorWordIndex(entry),
    }),
    [],
  ).element;
  return element ? readAlongHighlightElement(element) : null;
}

function readAlongHighlighterRootKey(options: ReadAlongDomHighlighterOptions): string {
  return JSON.stringify({
    highlightMotion: options.highlightMotion ?? "static",
    highlightStyle: options.highlightStyle ?? "none",
    mode: options.mode,
    sourceId: options.sourceId ?? "",
    surface: options.surface,
  });
}

function readAlongWordElementCacheKey(
  options: ReadAlongDomHighlighterOptions,
  entry: WordTimelineEntry,
): string {
  return JSON.stringify({
    anchorNodeId: entry.anchorNodeId ?? "",
    anchorTokenOffset: entry.anchorTokenOffset ?? null,
    anchorWordIndex: readAlongAnchorWordIndex(entry) ?? null,
    sourceId: options.sourceId ?? "",
    sourceWordIndex: entry.sourceWordIndex,
    text: entry.text,
  });
}

function readAlongAnchorWordIndex(entry: WordTimelineEntry): number | undefined {
  if (entry.anchorWordIndex !== undefined) {
    return entry.anchorWordIndex;
  }
  return entry.anchorNodeId ? undefined : entry.sourceWordIndex;
}

function isCachedReadAlongElementUsable(root: ParentNode, element: HTMLElement): boolean {
  if ("isConnected" in element && !element.isConnected) {
    return false;
  }
  if (
    typeof Node !== "undefined" &&
    root instanceof Node &&
    element instanceof Node &&
    !root.contains(element)
  ) {
    return false;
  }
  return true;
}

function activateReadAlongWordElement(
  element: HTMLElement,
  options: ReadAlongDomHighlighterOptions,
): void {
  const classes = readAlongHighlightClassName({
    active: true,
    highlightStyle: options.highlightStyle,
    mode: options.mode,
    surface: options.surface,
  }).split(/\s+/);
  for (const className of classes) {
    element.classList.add(className);
  }
  for (const className of WORD_ROLE_CLASSES) {
    element.classList.remove(className);
  }
  element.classList.add("readalong-word-role--active");
  element.setAttribute("aria-current", "true");
  element.dataset.readalongDomActive = "true";
  element.dataset.readalongWordRole = "active";
}

function readAlongHighlightElement(element: Element): HTMLElement | null {
  if (typeof HTMLElement === "undefined") {
    return element as HTMLElement;
  }
  return element instanceof HTMLElement ? element : null;
}

function deactivateReadAlongWordElement(element: HTMLElement): void {
  element.classList.remove(
    "readalong-highlight--active",
    "readalong-highlight--word",
    "book-cinema-word-active",
    "website-cinema-word-active",
  );
  for (const className of WORD_ROLE_CLASSES) {
    element.classList.remove(className);
  }
  element.removeAttribute("aria-current");
  delete element.dataset.readalongDomActive;
  delete element.dataset.readalongWordRole;
}

function maybeScrollReadAlongDomHighlight(
  element: HTMLElement,
  options: ReadAlongDomHighlighterOptions,
): void {
  const root = options.root();
  if (!root || !options.autoFollow) {
    return;
  }
  const decision = resolveReadAlongScrollPolicy({
    autoFollow: options.autoFollow,
    mode: options.mode,
    scrollFollow: options.scrollFollow,
    settings: options.accessibilitySettings ?? { reducedMotion: false },
    surface: options.surface,
  });
  if (!decision.shouldScroll || isElementInsideSafeBand(element, root)) {
    return;
  }
  element.scrollIntoView({
    behavior: decision.behavior,
    block: decision.block,
    inline: decision.inline,
  });
  markReadAlongPerformance("scroll-call");
}

function isElementInsideSafeBand(element: HTMLElement, root: ParentNode): boolean {
  if (typeof Element === "undefined" || !(root instanceof Element)) {
    return true;
  }
  const viewport = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const topSafe = viewport.top + viewport.height * 0.2;
  const bottomSafe = viewport.bottom - viewport.height * 0.25;
  return rect.top >= topSafe && rect.bottom <= bottomSafe;
}

function bindSchedulerAudioEvents(audio: HTMLAudioElement, syncNow: () => void): () => void {
  const events = ["play", "ratechange", "seeked", "seeking"] as const;
  for (const event of events) {
    audio.addEventListener(event, syncNow);
  }
  return () => {
    for (const event of events) {
      audio.removeEventListener(event, syncNow);
    }
  };
}

function browserWordSchedulerRuntime(): ReadAlongWordSchedulerRuntime {
  return {
    clearTimeout: (id) => {
      globalThis.clearTimeout(id);
    },
    now: () => performance.now(),
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  };
}
