import { describe, expect, it } from "vitest";
import {
  ReadAlongDomHighlighterSession,
  ReadAlongWordScheduler,
  applyReadAlongDomHighlight,
  nextWordBoundaryMs,
  resolveWordTimelineIndex,
} from "./ReadAlongWordScheduler";
import { updateReadAlongMotionCursor } from "./readAlongMotionCursor";
import type { WordTimeline, WordTimelineEntry } from "./wordTimeline";

describe("ReadAlongWordScheduler", () => {
  it("uses [start, end) boundaries so exact word boundaries advance", () => {
    expect(resolveWordTimelineIndex(timeline().entries, 0)).toBe(0);
    expect(resolveWordTimelineIndex(timeline().entries, 100)).toBe(1);
  });

  it("holds the previous word during gaps and schedules the next boundary", () => {
    const entries = [
      entry({ audioEndMs: 100, audioStartMs: 0, sourceWordIndex: 0 }),
      entry({ audioEndMs: 420, audioStartMs: 300, sourceWordIndex: 1 }),
    ];

    expect(resolveWordTimelineIndex(entries, 200)).toBe(0);
    expect(nextWordBoundaryMs(entries, 0, 200)).toBe(300);
  });

  it("schedules from the real audio clock and corrects drift on timeout", () => {
    const scheduled: { callback: () => void; delayMs: number }[] = [];
    const audio = fakeAudio({ currentTime: 0.05 });
    const activeWords: number[] = [];
    const scheduler = new ReadAlongWordScheduler({
      audioElement: () => audio,
      onWordChange: (active) => {
        activeWords.push(active.sourceWordIndex);
      },
      runtime: {
        clearTimeout: () => {
          scheduled.length = 0;
        },
        now: () => 0,
        setTimeout: (callback, delayMs) => {
          scheduled.push({ callback, delayMs });
          return scheduled.length;
        },
      },
      timeline: timeline(),
    });

    scheduler.start();

    expect(activeWords).toEqual([0]);
    expect(scheduled[0]?.delayMs).toBe(50);

    audio.currentTime = 0.12;
    scheduled.shift()?.callback();

    expect(activeWords).toEqual([0, 1]);
    scheduler.stop(false);
  });

  it("accounts for playback rate when scheduling the next word", () => {
    const scheduled: { delayMs: number }[] = [];
    const audio = fakeAudio({ currentTime: 0.05, playbackRate: 2 });
    const scheduler = new ReadAlongWordScheduler({
      audioElement: () => audio,
      runtime: {
        clearTimeout: noop,
        now: () => 0,
        setTimeout: (_callback, delayMs) => {
          scheduled.push({ delayMs });
          return scheduled.length;
        },
      },
      timeline: timeline(),
    });

    scheduler.start();

    expect(scheduled[0]?.delayMs).toBe(25);
    scheduler.stop(false);
  });

  it("does not schedule boundary work while audio is paused", () => {
    const scheduled: number[] = [];
    const scheduler = new ReadAlongWordScheduler({
      audioElement: () => fakeAudio({ currentTime: 0.05, paused: true }),
      runtime: {
        clearTimeout: noop,
        now: () => 0,
        setTimeout: (_callback, delayMs) => {
          scheduled.push(delayMs);
          return scheduled.length;
        },
      },
      timeline: timeline(),
    });

    scheduler.start();

    expect(scheduled).toEqual([]);
  });
});

describe("read-along DOM highlight adapter", () => {
  it("mutates only existing active words and the next active word", () => {
    const previous = fakeElement();
    previous.classList.add("book-cinema-word-active", "readalong-word-role--active");
    previous.setAttribute("aria-current", "true");
    previous.dataset.readalongDomActive = "true";
    const current = fakeElement();
    const root = fakeRoot({ current, previous });

    const result = applyReadAlongDomHighlight(
      {
        mode: "word",
        root: () => root,
        sourceId: "book",
        surface: "book",
      },
      entry({ sourceWordIndex: 1 }),
    );

    expect(result.activeElement).toBe(current);
    expect(previous.classList.contains("book-cinema-word-active")).toBe(false);
    expect(previous.getAttribute("aria-current")).toBeNull();
    expect(current.classList.contains("book-cinema-word-active")).toBe(true);
    expect(current.classList.contains("readalong-word-role--active")).toBe(true);
    expect(current.getAttribute("aria-current")).toBe("true");
  });

  it("resolves prepared-source anchors by block and local token offset", () => {
    const current = fakeElement();
    const selectors: string[] = [];
    const root = {
      querySelector: (selector: string) => {
        selectors.push(selector);
        return selector.includes("source-1") &&
          selector.includes("block-1") &&
          selector.includes("2")
          ? current
          : null;
      },
      querySelectorAll: () => [],
    } as unknown as ParentNode;

    applyReadAlongDomHighlight(
      {
        mode: "word",
        root: () => root,
        sourceId: "source-1",
        surface: "website",
      },
      entry({
        anchorNodeId: "block-1",
        anchorTokenOffset: 2,
        anchorWordIndex: 2,
        sourceWordIndex: 17,
      }),
    );

    expect(selectors.some((selector) => selector.includes("block-1"))).toBe(true);
    expect(current.getAttribute("aria-current")).toBe("true");
  });

  it("uses the block anchor for generated entries without a stable word anchor", () => {
    const rawWord = fakeElement();
    const summaryBlock = fakeElement();
    const root = fakeGeneratedBlockRoot({
      block: summaryBlock,
      word: rawWord,
    });

    applyReadAlongDomHighlight(
      {
        mode: "word",
        root: () => root,
        sourceId: "prepared-1",
        surface: "document",
      },
      entry({
        anchorNodeId: "summary",
        anchorTokenOffset: undefined,
        anchorWordIndex: undefined,
        sourceWordIndex: 17,
        text: "summary",
      }),
    );

    expect(summaryBlock.getAttribute("aria-current")).toBe("true");
    expect(rawWord.getAttribute("aria-current")).toBeNull();
    expect(root.selectors.some((selector) => selector.includes("data-readalong-word-index"))).toBe(
      false,
    );
  });
});

describe("ReadAlongDomHighlighterSession", () => {
  it("caches resolved word anchors after the first lookup", () => {
    const current = fakeElement();
    const root = fakeAnchorRoot({ elementsByWordIndex: new Map([[1, current]]) });
    const session = new ReadAlongDomHighlighterSession();
    const options = {
      mode: "word" as const,
      root: () => root,
      sourceId: "book",
      surface: "book" as const,
    };

    session.apply(options, entry({ sourceWordIndex: 1 }));
    const callsAfterFirstResolve = root.querySelectorCalls;
    session.apply(options, entry({ sourceWordIndex: 1 }));

    expect(callsAfterFirstResolve).toBeGreaterThan(0);
    expect(root.querySelectorCalls).toBe(callsAfterFirstResolve);
    expect(current.getAttribute("aria-current")).toBe("true");
  });

  it("invalidates cached anchors when the root changes", () => {
    const first = fakeElement();
    const second = fakeElement();
    const firstRoot = fakeAnchorRoot({ elementsByWordIndex: new Map([[1, first]]) });
    const secondRoot = fakeAnchorRoot({ elementsByWordIndex: new Map([[1, second]]) });
    const session = new ReadAlongDomHighlighterSession();

    session.apply(
      {
        mode: "word",
        root: () => firstRoot,
        sourceId: "book",
        surface: "book",
      },
      entry({ sourceWordIndex: 1 }),
    );
    session.apply(
      {
        mode: "word",
        root: () => secondRoot,
        sourceId: "book",
        surface: "book",
      },
      entry({ sourceWordIndex: 1 }),
    );

    expect(first.getAttribute("aria-current")).toBeNull();
    expect(second.getAttribute("aria-current")).toBe("true");
    expect(secondRoot.querySelectorCalls).toBeGreaterThan(0);
  });

  it("clears the previous active element when an anchor is missing", () => {
    const previous = fakeElement();
    const root = fakeAnchorRoot({ elementsByWordIndex: new Map([[1, previous]]) });
    const session = new ReadAlongDomHighlighterSession();
    const options = {
      mode: "word" as const,
      root: () => root,
      sourceId: "book",
      surface: "book" as const,
    };

    session.apply(options, entry({ sourceWordIndex: 1 }));
    const result = session.apply(options, entry({ sourceWordIndex: 2 }));

    expect(result.activeElement).toBeNull();
    expect(previous.getAttribute("aria-current")).toBeNull();
  });

  it("cleans up active state without rescanning on every word boundary", () => {
    const first = fakeElement();
    const second = fakeElement();
    const root = fakeAnchorRoot({
      elementsByWordIndex: new Map([
        [1, first],
        [2, second],
      ]),
    });
    const session = new ReadAlongDomHighlighterSession();
    const options = {
      mode: "word" as const,
      root: () => root,
      sourceId: "book",
      surface: "book" as const,
    };

    session.apply(options, entry({ sourceWordIndex: 1 }));
    const scansAfterSetup = root.querySelectorAllCalls;
    session.apply(options, entry({ sourceWordIndex: 2 }));
    session.clear(options);

    expect(root.querySelectorAllCalls).toBe(scansAfterSetup + 1);
    expect(first.getAttribute("aria-current")).toBeNull();
    expect(second.getAttribute("aria-current")).toBeNull();
  });
});

describe("read-along motion cursor", () => {
  it("creates one cursor and glides same-line words with clamped voice-paced timing", () => {
    const root = fakeMotionRoot({ bottom: 200, height: 200, left: 0, top: 0, width: 500 });
    const active = fakeElement({
      bottom: 24,
      height: 20,
      left: 40,
      top: 4,
      width: 42,
    });
    const next = fakeElement({
      bottom: 24,
      height: 20,
      left: 92,
      top: 4,
      width: 36,
    });

    const first = updateReadAlongMotionCursor({
      activeElement: asHTMLElement(active),
      highlightMotion: "smoothCursor",
      nextElement: asHTMLElement(next),
      root: asParentNode(root),
      transitionDurationMs: 600,
    });
    const second = updateReadAlongMotionCursor({
      activeElement: asHTMLElement(next),
      highlightMotion: "smoothCursor",
      nextElement: asHTMLElement(active),
      root: asParentNode(root),
      transitionDurationMs: 600,
    });

    expect(first.cursor).toBe(second.cursor);
    expect(second.state).toBe("gliding");
    expect(second.cursor?.dataset.readalongMotionCursor).toBe("true");
    expect(second.cursor?.style.getPropertyValue("--readalong-motion-duration-ms")).toBe("420ms");
    expect(second.cursor?.style.transform).toContain("translate3d");
  });

  it("uses fallback repositioning for line changes", () => {
    const root = fakeMotionRoot({ bottom: 200, height: 200, left: 0, top: 0, width: 500 });
    const active = fakeElement({
      bottom: 24,
      height: 20,
      left: 40,
      top: 4,
      width: 42,
    });
    const nextLine = fakeElement({
      bottom: 58,
      height: 20,
      left: 12,
      top: 38,
      width: 64,
    });

    updateReadAlongMotionCursor({
      activeElement: asHTMLElement(active),
      highlightMotion: "smoothCursor",
      root: asParentNode(root),
    });
    const result = updateReadAlongMotionCursor({
      activeElement: asHTMLElement(nextLine),
      highlightMotion: "smoothCursor",
      nextElement: asHTMLElement(active),
      root: asParentNode(root),
      transitionDurationMs: 120,
    });

    expect(result.state).toBe("fallback");
    expect(result.cursor?.dataset.readalongMotionState).toBe("fallback");
  });

  it("cleans up the cursor when motion is static", () => {
    const root = fakeMotionRoot({ bottom: 200, height: 200, left: 0, top: 0, width: 500 });
    const active = fakeElement({
      bottom: 24,
      height: 20,
      left: 40,
      top: 4,
      width: 42,
    });

    updateReadAlongMotionCursor({
      activeElement: asHTMLElement(active),
      highlightMotion: "smoothCursor",
      root: asParentNode(root),
    });
    updateReadAlongMotionCursor({
      activeElement: asHTMLElement(active),
      highlightMotion: "static",
      root: asParentNode(root),
    });

    expect(root.querySelector("[data-readalong-motion-cursor]")).toBeNull();
    expect(root.dataset.readalongHighlightMotion).toBe("static");
  });
});

function timeline(): WordTimeline {
  const entries = [
    entry({ audioEndMs: 100, audioStartMs: 0, sourceWordIndex: 0 }),
    entry({ audioEndMs: 220, audioStartMs: 100, sourceWordIndex: 1 }),
    entry({ audioEndMs: 360, audioStartMs: 220, sourceWordIndex: 2 }),
  ];
  return {
    durationMs: 360,
    entries,
    ledger: [],
    source: "highlight-map-v2",
    speechTokens: [],
    status: "ready",
  };
}

function entry(overrides: Partial<WordTimelineEntry> = {}): WordTimelineEntry {
  const sourceWordIndex = overrides.sourceWordIndex ?? 0;
  return {
    audioEndMs: overrides.audioEndMs ?? 100,
    audioStartMs: overrides.audioStartMs ?? 0,
    confidence: 1,
    entryId: `entry-${sourceWordIndex.toString()}`,
    normalizedText: `word-${sourceWordIndex.toString()}`,
    provenance: "provider-word",
    sourceWordId: `book:scope:word:${sourceWordIndex.toString()}`,
    sourceWordIndex,
    spokenTokenId: `spoken-${sourceWordIndex.toString()}`,
    text: `word-${sourceWordIndex.toString()}`,
    timingLevel: "word",
    ...overrides,
  };
}

function fakeAudio({
  currentTime,
  paused = false,
  playbackRate = 1,
}: {
  currentTime: number;
  paused?: boolean;
  playbackRate?: number;
}): HTMLAudioElement {
  return {
    addEventListener: noop,
    currentTime,
    paused,
    playbackRate,
    removeEventListener: noop,
  } as unknown as HTMLAudioElement;
}

function fakeRoot({
  current,
  previous,
}: {
  current: FakeElement;
  previous: FakeElement;
}): ParentNode {
  return {
    querySelector: () => current,
    querySelectorAll: () => [previous],
  } as unknown as ParentNode;
}

function fakeAnchorRoot({
  elementsByWordIndex,
}: {
  elementsByWordIndex: Map<number, FakeElement>;
}): FakeAnchorRoot & ParentNode {
  return new FakeAnchorRoot(elementsByWordIndex) as FakeAnchorRoot & ParentNode;
}

function fakeGeneratedBlockRoot({
  block,
  word,
}: {
  block: FakeElement;
  word: FakeElement;
}): FakeGeneratedBlockRoot & ParentNode {
  return new FakeGeneratedBlockRoot(block, word) as FakeGeneratedBlockRoot & ParentNode;
}

function fakeMotionRoot(rect: FakeRect): FakeElement {
  return new FakeElement(rect);
}

function asHTMLElement(element: FakeElement): HTMLElement {
  return element as unknown as HTMLElement;
}

function asParentNode(element: FakeElement): ParentNode {
  return element as unknown as ParentNode;
}

function fakeElement(rect?: FakeRect): FakeElement {
  return new FakeElement(rect);
}

interface FakeRect {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
}

const DEFAULT_FAKE_RECT: FakeRect = { bottom: 20, height: 20, left: 0, top: 0, width: 40 };

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string | undefined> = {};
  readonly ownerDocument = {
    createElement: () => fakeElement(),
  };
  readonly style = new FakeStyle();
  private parent: FakeElement | null = null;
  private readonly rect: FakeRect;
  scrollLeft = 0;
  scrollTop = 0;

  constructor(rect?: FakeRect) {
    this.rect = rect ?? DEFAULT_FAKE_RECT;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  getBoundingClientRect(): DOMRect {
    return {
      bottom: this.rect.bottom,
      height: this.rect.height,
      left: this.rect.left,
      right: this.rect.left + this.rect.width,
      top: this.rect.top,
      width: this.rect.width,
      x: this.rect.left,
      y: this.rect.top,
      toJSON: () => this.rect,
    };
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "[data-readalong-motion-cursor]") {
      return this.children.find((child) => child.dataset.readalongMotionCursor === "true") ?? null;
    }
    return null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector === "[data-readalong-motion-cursor]") {
      return this.children.filter((child) => child.dataset.readalongMotionCursor === "true");
    }
    return [];
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  scrollIntoView(): void {
    // Not needed in node tests.
  }

  remove(): void {
    if (!this.parent) {
      return;
    }
    const index = this.parent.children.indexOf(this);
    if (index !== -1) {
      this.parent.children.splice(index, 1);
    }
    this.parent = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeAnchorRoot {
  querySelectorAllCalls = 0;
  querySelectorCalls = 0;

  constructor(private readonly elementsByWordIndex: Map<number, FakeElement>) {}

  querySelector(selector: string): FakeElement | null {
    this.querySelectorCalls += 1;
    const wordIndex = /data-readalong-word-index="(\d+)"/.exec(selector)?.[1];
    if (wordIndex === undefined) {
      return null;
    }
    return this.elementsByWordIndex.get(Number(wordIndex)) ?? null;
  }

  querySelectorAll(): FakeElement[] {
    this.querySelectorAllCalls += 1;
    return [];
  }
}

class FakeGeneratedBlockRoot {
  readonly selectors: string[] = [];

  constructor(
    private readonly block: FakeElement,
    private readonly word: FakeElement,
  ) {}

  querySelector(selector: string): FakeElement | null {
    this.selectors.push(selector);
    if (selector.includes("data-readalong-word-index")) {
      return this.word;
    }
    if (selector.includes('data-readalong-node-id="summary"')) {
      return this.block;
    }
    return null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }
}

function noop(): void {
  // Test stub.
}

class FakeClassList {
  private readonly values = new Set<string>();

  add(...classNames: string[]): void {
    for (const className of classNames) {
      this.values.add(className);
    }
  }

  contains(className: string): boolean {
    return this.values.has(className);
  }

  remove(...classNames: string[]): void {
    for (const className of classNames) {
      this.values.delete(className);
    }
  }
}

class FakeStyle {
  opacity = "";
  transform = "";
  private readonly values = new Map<string, string>();

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? "";
  }

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}
