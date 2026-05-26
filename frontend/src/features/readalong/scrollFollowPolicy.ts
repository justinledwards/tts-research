import type { ReaderAccessibilitySettings } from "../reader-accessibility";
import { type ReadAlongDomAnchor, resolveReadAlongDomAnchor } from "./domAnchorResolver";
import type { ReadAlongScrollFollow } from "./readAlongPreferences";
import type {
  ReadAlongHighlightSurface,
  ReadAlongHighlightVisualMode,
} from "./highlightVisualModes";

export type ReadAlongScrollPolicy =
  | "gentle"
  | "keep-current-line-centered"
  | "off"
  | "page-boundary-only"
  | "teleprompt-continuous";

export interface ReadAlongScrollDecision {
  behavior: ScrollBehavior;
  block: ScrollLogicalPosition;
  inline: ScrollLogicalPosition;
  policy: ReadAlongScrollPolicy;
  reason: string;
  shouldScroll: boolean;
}

export interface ReadAlongScrollDecisionInput {
  autoFollow: boolean;
  mode: ReadAlongHighlightVisualMode;
  scrollFollow?: ReadAlongScrollFollow;
  settings: Pick<ReaderAccessibilitySettings, "reducedMotion">;
  surface: ReadAlongHighlightSurface;
}

export function resolveReadAlongScrollPolicy({
  autoFollow,
  mode,
  scrollFollow,
  settings,
  surface,
}: ReadAlongScrollDecisionInput): ReadAlongScrollDecision {
  if (!autoFollow || scrollFollow === "off") {
    return scrollDecision("off", false, "Auto-follow is disabled.", settings.reducedMotion);
  }
  if (mode === "none") {
    return scrollDecision(
      "off",
      false,
      "Highlight is paused for this audio state.",
      settings.reducedMotion,
    );
  }
  if (settings.reducedMotion) {
    return scrollDecision(
      surface === "book" ? "page-boundary-only" : "gentle",
      true,
      "Reduced motion uses instant, bounded scroll changes.",
      true,
    );
  }
  if (scrollFollow) {
    return scrollFollowDecision(scrollFollow, mode, surface);
  }
  if (surface === "teleprompt") {
    return {
      behavior: "smooth",
      block: "center",
      inline: "nearest",
      policy: "teleprompt-continuous",
      reason: "Teleprompt keeps the active cue centered while presenting.",
      shouldScroll: true,
    };
  }
  if (surface === "book") {
    return {
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
      policy: "page-boundary-only",
      reason: "Paged reading advances only at page or spread boundaries.",
      shouldScroll: true,
    };
  }
  return {
    behavior: "smooth",
    block: mode === "word" ? "center" : "nearest",
    inline: "nearest",
    policy: mode === "word" ? "keep-current-line-centered" : "gentle",
    reason: "Reader gently follows the active rendered passage.",
    shouldScroll: true,
  };
}

export function scrollReadAlongAnchor(
  root: ParentNode | null | undefined,
  anchor: ReadAlongDomAnchor | null | undefined,
  input: ReadAlongScrollDecisionInput & {
    fallbackSelectors?: readonly string[];
  },
): ReadAlongScrollDecision & { resolved: ReturnType<typeof resolveReadAlongDomAnchor> } {
  const decision = resolveReadAlongScrollPolicy(input);
  const resolved = resolveReadAlongDomAnchor(root, anchor, input.fallbackSelectors ?? []);
  if (decision.shouldScroll && resolved.element) {
    resolved.element.scrollIntoView({
      behavior: decision.behavior,
      block: decision.block,
      inline: decision.inline,
    });
  }
  return { ...decision, resolved };
}

export function readAlongScrollPolicyDataAttributes(
  decision: ReadAlongScrollDecision,
): Record<string, string> {
  return {
    "data-readalong-scroll-policy": decision.policy,
    "data-readalong-scroll-reason": decision.reason,
  };
}

function scrollDecision(
  policy: ReadAlongScrollPolicy,
  shouldScroll: boolean,
  reason: string,
  reducedMotion: boolean,
): ReadAlongScrollDecision {
  return {
    behavior: reducedMotion ? "auto" : "smooth",
    block: "nearest",
    inline: "nearest",
    policy,
    reason,
    shouldScroll,
  };
}

function scrollFollowDecision(
  scrollFollow: ReadAlongScrollFollow,
  mode: ReadAlongHighlightVisualMode,
  surface: ReadAlongHighlightSurface,
): ReadAlongScrollDecision {
  switch (scrollFollow) {
    case "centerCurrentLine": {
      return {
        behavior: "smooth",
        block: "center",
        inline: "nearest",
        policy: "keep-current-line-centered",
        reason: "Read-along settings center the current line.",
        shouldScroll: mode !== "none",
      };
    }
    case "pageBoundaryOnly": {
      return {
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
        policy: "page-boundary-only",
        reason: "Read-along settings follow at page or passage boundaries.",
        shouldScroll: mode !== "none",
      };
    }
    case "telepromptContinuous": {
      return {
        behavior: "smooth",
        block: "center",
        inline: "nearest",
        policy: "teleprompt-continuous",
        reason:
          surface === "teleprompt"
            ? "Teleprompt keeps the active cue centered while presenting."
            : "Read-along settings use continuous Teleprompt-style follow.",
        shouldScroll: mode !== "none",
      };
    }
    case "gentle": {
      return {
        behavior: "smooth",
        block: mode === "word" ? "center" : "nearest",
        inline: "nearest",
        policy: mode === "word" ? "keep-current-line-centered" : "gentle",
        reason: "Read-along settings gently follow the active rendered passage.",
        shouldScroll: mode !== "none",
      };
    }
    case "off": {
      return scrollDecision("off", false, "Auto-follow is disabled.", false);
    }
  }
}
