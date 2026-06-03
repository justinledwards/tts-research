import type { CSSProperties, ReactNode, RefObject } from "react";
import {
  buildTelepromptWordCuesFromIndex,
  buildTeleprompterWordCues,
  splitTeleprompterTokens,
  type TeleprompterHighlightSettings,
} from "../../teleprompter";
import { Panel, StatusChip, cx, type StatusChipTone } from "../../design";
import {
  buildReadingFollowAlongTokensFromText,
  ReadingFollowAlongRenderer,
  readingSurfaceClassName,
  readingSurfaceDataAttributes,
} from "../reading-surface";
import type { ReadAlongCueRole, ReadAlongTimingState, ReadAlongWordRole } from "../readalong";
import type { TelepromptCueSyncMode, TelepromptCueWordTiming } from "./telepromptCueTimeline";
import { estimateTelepromptDurationMs, countTelepromptWords } from "./telepromptToolbar";
import type { RevisionBlock } from "../revision";

export function TelepromptCurrentCueStage({
  activeRef,
  audioStatusLabel,
  audioStatusTone,
  block,
  cuePositionLabel,
  cueProgressPercent,
  cueText,
  currentSourceWordId,
  currentWordIndex,
  highContrast,
  mirrorMode,
  settings,
  textClassName,
  timingState = "trusted",
  wordTimings = [],
  wordSpacing,
  workModeDetail,
  workModeLabel,
  workModeTone,
  workModeDataAttributes,
}: Readonly<{
  activeRef?: RefObject<HTMLDivElement | null>;
  audioStatusLabel: string;
  audioStatusTone: StatusChipTone;
  block: RevisionBlock | null;
  cuePositionLabel: string;
  cueProgressPercent: number;
  cueText: string | null;
  currentSourceWordId?: string | null;
  currentWordIndex?: number | null;
  highContrast: boolean;
  mirrorMode: boolean;
  settings: TeleprompterHighlightSettings;
  textClassName: string;
  timingState?: ReadAlongTimingState;
  wordTimings?: readonly TelepromptCueWordTiming[];
  wordSpacing: string;
  workModeDataAttributes: Record<string, string | undefined>;
  workModeDetail: string;
  workModeLabel: string;
  workModeTone: "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "pinned";
}>) {
  const spokenText = block ? block.spokenText || block.text : "";
  const shouldRenderCue =
    Boolean(block) &&
    ((typeof currentWordIndex === "number" && currentWordIndex >= 0) ||
      Boolean(cueText && normalizeCueText(cueText) === normalizeCueText(spokenText)));
  let cueContent: ReactNode = "No cue is selected.";
  if (block) {
    cueContent = shouldRenderCue ? (
      <TelepromptCueWords
        cueRole="current"
        currentSourceWordId={currentSourceWordId}
        currentWordIndex={currentWordIndex}
        settings={settings}
        timingState={timingState}
        text={spokenText}
        wordTimings={wordTimings}
      />
    ) : (
      spokenText || "No spoken text is available for this cue."
    );
  }
  return (
    <section
      aria-label="Current teleprompt cue"
      className={cx(
        "grid min-h-[30rem] gap-4 rounded-lg border p-4 shadow-sm sm:min-h-[34rem] sm:p-5 xl:min-h-[40rem]",
        highContrast
          ? "border-[var(--vs-border-strong)] bg-[var(--vs-theatre-bg)] text-[var(--vs-theatre-text)]"
          : "border-[var(--vs-selected-border)] bg-[var(--vs-surface)]",
      )}
      data-testid="teleprompt-current-cue-stage"
      data-teleprompt-cue-priority="primary"
      {...workModeDataAttributes}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusChip tone={workModeTone}>{workModeLabel}</StatusChip>
          <StatusChip tone={audioStatusTone}>{audioStatusLabel}</StatusChip>
          <span
            className={cx(
              "text-xs font-semibold",
              highContrast ? "text-[var(--vs-text-secondary)]" : "vs-muted",
            )}
          >
            {cuePositionLabel}
          </span>
        </div>
        <span
          className={cx(
            "text-xs font-semibold",
            highContrast ? "text-[var(--vs-text-secondary)]" : "vs-muted",
          )}
        >
          {cueProgressPercent.toString()}% script
        </span>
      </div>
      <div className="grid gap-1">
        <div
          className={cx(
            "h-2 overflow-hidden rounded-full",
            highContrast ? "bg-[var(--vs-theatre-panel)]" : "bg-[var(--vs-border)]",
          )}
        >
          <div
            className={cx(
              "h-full rounded-full",
              highContrast ? "bg-[var(--vs-theatre-accent)]" : "bg-[var(--vs-action-primary)]",
            )}
            style={{ width: `${cueProgressPercent.toString()}%` }}
          />
        </div>
        <p
          className={cx(
            "text-xs leading-5",
            highContrast ? "text-[var(--vs-text-secondary)]" : "vs-muted",
          )}
        >
          {workModeDetail}
        </p>
      </div>
      <div
        className="grid min-h-0 flex-1 place-items-center rounded-md p-3 sm:p-5"
        data-readalong-cue-role={block ? "current" : "unavailable"}
        data-readalong-timing-state={timingState}
        data-testid="teleprompt-current-cue"
        ref={activeRef}
        {...readingSurfaceDataAttributes({ active: Boolean(block), kind: "cue" })}
        style={{
          transform: mirrorMode ? "scaleX(-1)" : undefined,
          wordSpacing,
        }}
      >
        <p
          className={cx(
            "max-w-5xl whitespace-pre-wrap text-center",
            readingSurfaceClassName("cue"),
            textClassName,
          )}
        >
          {cueContent}
        </p>
      </div>
    </section>
  );
}

export function TelepromptScriptBlock({
  activeRef,
  active,
  block,
  cueText,
  cueRole = active ? "current" : "unavailable",
  currentSourceWordId,
  currentWordIndex,
  highContrast,
  presetClassName,
  settings,
  timingState = "trusted",
  wordTimings = [],
  onSelect,
}: Readonly<{
  activeRef?: RefObject<HTMLDivElement | null>;
  active: boolean;
  block: RevisionBlock;
  cueText: string | null;
  cueRole?: ReadAlongCueRole;
  currentSourceWordId?: string | null;
  currentWordIndex?: number | null;
  highContrast: boolean;
  presetClassName: string;
  settings: TeleprompterHighlightSettings;
  timingState?: ReadAlongTimingState;
  wordTimings?: readonly TelepromptCueWordTiming[];
  onSelect: () => void;
}>) {
  const spokenText = block.spokenText || block.text;
  const shouldRenderCue =
    active &&
    ((typeof currentWordIndex === "number" && currentWordIndex >= 0) ||
      Boolean(cueText && normalizeCueText(cueText) === normalizeCueText(spokenText)));
  return (
    <div
      className={cx(
        "rounded-md px-3 py-4 transition",
        telepromptScriptBlockClassName({ active, highContrast }),
      )}
      {...readingSurfaceDataAttributes({ active, kind: "cue" })}
      data-readalong-cue-role={cueRole}
      data-readalong-timing-state={timingState}
      data-testid={`teleprompt-block-${block.id}`}
      ref={activeRef}
    >
      <button
        className="mb-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-md bg-transparent px-1 py-2 text-left text-sm font-semibold hover:bg-[var(--vs-selected)]"
        data-testid={`ui-action-teleprompt-cue-${String(block.index)}`}
        data-ui-noop-reason={active ? "Cue is already selected." : undefined}
        onClick={onSelect}
        type="button"
      >
        <span>
          Cue {block.index.toString()}: {block.label}
        </span>
        {active ? <StatusChip tone="success">Selected</StatusChip> : null}
      </button>
      <p className={cx("whitespace-pre-wrap", readingSurfaceClassName("cue"), presetClassName)}>
        {shouldRenderCue ? (
          <TelepromptCueWords
            cueRole={cueRole}
            currentSourceWordId={currentSourceWordId}
            currentWordIndex={currentWordIndex}
            settings={settings}
            timingState={timingState}
            text={spokenText}
            wordTimings={wordTimings}
          />
        ) : (
          spokenText || "No spoken text is available for this cue."
        )}
      </p>
    </div>
  );
}

function telepromptScriptBlockClassName({
  active,
  highContrast,
}: Readonly<{ active: boolean; highContrast: boolean }>): string {
  if (active && highContrast) {
    return "bg-[var(--vs-theatre-bg)] text-[var(--vs-theatre-text)] shadow-[inset_0.28rem_0_0_var(--vs-theatre-accent)] ring-1 ring-[var(--vs-selected-border)]";
  }
  if (active) {
    return "bg-[var(--vs-selected)] shadow-[inset_0.28rem_0_0_var(--vs-accent)] ring-1 ring-[var(--vs-selected-border)]";
  }
  if (highContrast) {
    return "bg-[var(--vs-theatre-bg)] text-[var(--vs-theatre-text)]";
  }
  return "bg-transparent hover:bg-[var(--vs-raised)]";
}

export function TelepromptCueWords({
  cueRole = "current",
  currentSourceWordId,
  currentWordIndex,
  settings,
  timingState = "trusted",
  text,
  wordTimings = [],
}: Readonly<{
  cueRole?: ReadAlongCueRole;
  currentSourceWordId?: string | null;
  currentWordIndex?: number | null;
  settings: TeleprompterHighlightSettings;
  timingState?: ReadAlongTimingState;
  text: string;
  wordTimings?: readonly TelepromptCueWordTiming[];
}>) {
  const tokens = splitTeleprompterTokens(text);
  const cues =
    typeof currentWordIndex === "number" && currentWordIndex >= 0
      ? buildTelepromptWordCuesFromIndex(tokens, currentWordIndex, settings)
      : buildTeleprompterWordCues(
          text,
          settings.leadMs,
          estimateTelepromptDurationMs(countTelepromptWords(text)),
          settings,
        );
  const cueByIndex = new Map(cues.map((cue) => [cue.wordIndex, cue]));
  const timingMaps = telepromptWordTimingMaps(wordTimings);
  return (
    <ReadingFollowAlongRenderer
      activeSourceWordId={currentSourceWordId}
      activeWordIndex={currentWordIndex}
      classNameForWord={({ role, token }) => {
        const cue = cueByIndex.get(token.wordIndex);
        return `teleprompter-word teleprompter-word--${telepromptVisualWordState(
          cue?.state,
          role,
        )} rounded px-1 py-0.5`;
      }}
      cue={{
        cueText: text,
        spokenText: text,
        tokens: buildReadingFollowAlongTokensFromText(text, timingMaps),
      }}
      cueRole={cueRole}
      dataEffect="classic"
      mode="audio-follow"
      surface="teleprompt"
      surfaceKind="cue"
      timingState={timingState}
      wordStyle={({ role, token }) => {
        const cue = cueByIndex.get(token.wordIndex);
        return {
          "--teleprompter-accent": "#f97316",
          "--teleprompter-intensity": String(telepromptVisualWordIntensity(cue?.intensity, role)),
        } as CSSProperties;
      }}
    />
  );
}

function telepromptVisualWordState(cueState: string | undefined, role: ReadAlongWordRole): string {
  if (role === "active" || role === "recent" || role === "spoken" || role === "upcoming") {
    return cueState ?? "idle";
  }
  return "idle";
}

function telepromptVisualWordIntensity(
  intensity: number | undefined,
  role: ReadAlongWordRole,
): number {
  return role === "active" || role === "recent" || role === "spoken" || role === "upcoming"
    ? (intensity ?? 0)
    : 0;
}

function telepromptWordTimingMaps(
  wordTimings: readonly TelepromptCueWordTiming[],
): Parameters<typeof buildReadingFollowAlongTokensFromText>[1] {
  const sourceWordIdByWordIndex = new Map<number, string>();
  const sourceWordIndexByWordIndex = new Map<number, number>();
  const spokenTokenIdByWordIndex = new Map<number, string>();
  const timingConfidenceByWordIndex = new Map<number, number>();
  for (const timing of wordTimings) {
    if (timing.sourceWordId) {
      sourceWordIdByWordIndex.set(timing.wordIndex, timing.sourceWordId);
    }
    if (typeof timing.sourceWordIndex === "number") {
      sourceWordIndexByWordIndex.set(timing.wordIndex, timing.sourceWordIndex);
    }
    if (timing.spokenTokenId) {
      spokenTokenIdByWordIndex.set(timing.wordIndex, timing.spokenTokenId);
    }
    timingConfidenceByWordIndex.set(timing.wordIndex, timing.confidence);
  }
  return {
    sourceWordIdByWordIndex,
    sourceWordIndexByWordIndex,
    spokenTokenIdByWordIndex,
    timingConfidenceByWordIndex,
  };
}

export function TelepromptBlockPreview({
  block,
  label,
  words,
}: Readonly<{ block: RevisionBlock | null; label: string; words?: number }>) {
  return (
    <Panel className="grid gap-2 p-3" variant="surface">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
        {block ? (
          <StatusChip tone="neutral">
            {words?.toLocaleString() ?? countTelepromptWords(block.spokenText)} words
          </StatusChip>
        ) : null}
      </div>
      <p className="text-sm font-semibold">{block ? block.label : "No block"}</p>
      <p className="line-clamp-4 text-xs leading-5 vs-muted">
        {block ? block.spokenText || block.text : "This edge of the script is empty."}
      </p>
    </Panel>
  );
}

export function TelepromptMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</dt>
      <dd className="mt-1 text-base font-semibold">{value}</dd>
    </div>
  );
}

export function TelepromptContextFact({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <dt className="vs-muted">{label}</dt>
      <dd className="truncate font-semibold text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function cueSyncModeLabel(mode: TelepromptCueSyncMode): string {
  switch (mode) {
    case "audio-follow": {
      return "Audio-follow cue sync";
    }
    case "manual": {
      return "Manual cue sync";
    }
    case "recording-rehearsal": {
      return "Recording rehearsal cue sync";
    }
    case "review-playback": {
      return "Review playback cue sync";
    }
  }
}

export function telepromptCueLiveLabel(block: RevisionBlock | null, totalBlocks: number): string {
  if (!block) {
    return "the selected cue";
  }
  return `${block.index.toString()} of ${totalBlocks.toString()}`;
}

function normalizeCueText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}
