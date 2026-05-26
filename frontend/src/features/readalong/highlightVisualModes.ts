import type { ReadAlongRuntimeSnapshot, ReadAlongVisualMode } from "./readAlongState";
import {
  normalizeReadAlongPreferences,
  readAlongVisualModeFromPreferences,
  type ReadAlongHighlightStyle,
  type ReadAlongPreferences,
} from "./readAlongPreferences";

export type ReadAlongHighlightVisualMode =
  | "word"
  | "phrase"
  | "sentence"
  | "block"
  | "degraded"
  | "none";

export type ReadAlongHighlightSurface = "book" | "document" | "teleprompt" | "website";

export interface ReadAlongHighlightClassInput {
  active: boolean;
  highlightStyle?: ReadAlongHighlightStyle;
  mode: ReadAlongHighlightVisualMode;
  phrase?: boolean;
  surface: ReadAlongHighlightSurface;
}

export function readAlongVisualModeFromRuntime(
  snapshot: Pick<ReadAlongRuntimeSnapshot, "mode" | "state"> | null | undefined,
  preferences?: ReadAlongPreferences | null,
): ReadAlongHighlightVisualMode {
  if (preferences) {
    return normalizeReadAlongVisualMode(readAlongVisualModeFromPreferences(snapshot, preferences));
  }
  if (!snapshot) {
    return "block";
  }
  if (snapshot.state === "stale-audio" || snapshot.mode === "none") {
    return "none";
  }
  if (snapshot.state === "degraded") {
    return "degraded";
  }
  return normalizeReadAlongVisualMode(snapshot.mode);
}

export function normalizeReadAlongVisualMode(
  mode: ReadAlongHighlightVisualMode | ReadAlongVisualMode | null | undefined,
): ReadAlongHighlightVisualMode {
  if (
    mode === "word" ||
    mode === "phrase" ||
    mode === "sentence" ||
    mode === "block" ||
    mode === "degraded" ||
    mode === "none"
  ) {
    return mode;
  }
  return "block";
}

export function readAlongShouldHighlightWord(mode: ReadAlongHighlightVisualMode): boolean {
  return mode === "word";
}

export function readAlongShouldHighlightPhrase(mode: ReadAlongHighlightVisualMode): boolean {
  return mode === "phrase" || mode === "sentence";
}

export function readAlongShouldHighlightBlock(mode: ReadAlongHighlightVisualMode): boolean {
  return mode === "block" || mode === "degraded";
}

export function readAlongHighlightClassName({
  active,
  highlightStyle,
  mode,
  phrase = false,
  surface,
}: ReadAlongHighlightClassInput): string {
  const classes = ["readalong-highlight", `readalong-highlight--${surface}`];
  const normalizedStyle = highlightStyle
    ? normalizeReadAlongPreferences({ highlightStyle }).highlightStyle
    : null;
  if (normalizedStyle) {
    classes.push(`readalong-highlight-style--${normalizedStyle}`);
  }
  if (phrase) {
    classes.push("readalong-highlight--phrase");
    if (surface === "book") {
      classes.push("book-cinema-word-phrase");
    }
  }
  if (!active) {
    return classes.join(" ");
  }
  classes.push("readalong-highlight--active", `readalong-highlight--${mode}`);
  if (surface === "book" && mode === "word") {
    classes.push("book-cinema-word-active");
  }
  if ((surface === "website" || surface === "document") && mode === "word") {
    classes.push("website-cinema-word-active");
  }
  if ((surface === "website" || surface === "document") && readAlongShouldHighlightBlock(mode)) {
    classes.push("prepared-source-cinema-active");
  }
  return classes.join(" ");
}

export function readAlongHighlightModeLabel(mode: ReadAlongHighlightVisualMode): string {
  switch (mode) {
    case "word": {
      return "Word highlight";
    }
    case "phrase": {
      return "Phrase highlight";
    }
    case "sentence": {
      return "Sentence highlight";
    }
    case "block": {
      return "Block highlight";
    }
    case "degraded": {
      return "Degraded highlight";
    }
    case "none": {
      return "Highlight paused";
    }
  }
}

export function readAlongHighlightDataAttributes(
  mode: ReadAlongHighlightVisualMode,
  surface: ReadAlongHighlightSurface,
): Record<string, string> {
  return {
    "data-readalong-renderer": "",
    "data-readalong-surface": surface,
    "data-readalong-visual-mode": mode,
  };
}
