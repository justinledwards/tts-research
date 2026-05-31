import type { CSSProperties, RefObject } from "react";
import { HighlightRenderer } from "../readalong";
import {
  buildTelepromptWordCuesFromIndex,
  buildTeleprompterWordCues,
  splitTeleprompterTokens,
  type TeleprompterHighlightSettings,
} from "../../teleprompter";
import { Panel, StatusChip, cx } from "../../design";
import { readingSurfaceClassName, readingSurfaceDataAttributes } from "../reading-surface";
import type { ReadAlongCueRole, ReadAlongTimingState, ReadAlongWordRole } from "../readalong";
import type { TelepromptCueSyncMode } from "./telepromptCueTimeline";
import { estimateTelepromptDurationMs, countTelepromptWords } from "./telepromptToolbar";
import type { RevisionBlock } from "../revision";

export function TelepromptScriptBlock({
  activeRef,
  active,
  block,
  cueText,
  cueRole = active ? "current" : "unavailable",
  currentWordIndex,
  highContrast,
  presetClassName,
  settings,
  timingState = "trusted",
  onSelect,
}: Readonly<{
  activeRef?: RefObject<HTMLDivElement | null>;
  active: boolean;
  block: RevisionBlock;
  cueText: string | null;
  cueRole?: ReadAlongCueRole;
  currentWordIndex?: number | null;
  highContrast: boolean;
  presetClassName: string;
  settings: TeleprompterHighlightSettings;
  timingState?: ReadAlongTimingState;
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
            currentWordIndex={currentWordIndex}
            settings={settings}
            timingState={timingState}
            text={spokenText}
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
    return "bg-zinc-950 text-white shadow-[inset_0.28rem_0_0_#fb923c] ring-1 ring-orange-300";
  }
  if (active) {
    return "bg-orange-500/10 shadow-[inset_0.28rem_0_0_var(--vs-accent)] ring-1 ring-orange-300";
  }
  if (highContrast) {
    return "bg-zinc-950 text-white";
  }
  return "bg-transparent hover:bg-[var(--vs-raised)]";
}

export function TelepromptCueWords({
  cueRole = "current",
  currentWordIndex,
  settings,
  timingState = "trusted",
  text,
}: Readonly<{
  cueRole?: ReadAlongCueRole;
  currentWordIndex?: number | null;
  settings: TeleprompterHighlightSettings;
  timingState?: ReadAlongTimingState;
  text: string;
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
  return (
    <HighlightRenderer
      activeWordIndex={currentWordIndex}
      classNameForWord={({ token }) => {
        const cue = cueByIndex.get(token.wordIndex);
        return `teleprompter-word teleprompter-word--${cue?.state ?? "idle"} rounded px-1 py-0.5`;
      }}
      cueRole={cueRole}
      dataEffect="classic"
      mode="word"
      surface="teleprompt"
      timingState={timingState}
      text={text}
      wordRoleForWord={({ token }) => {
        const cue = cueByIndex.get(token.wordIndex);
        return telepromptReadAlongWordRole(cue?.state, token.wordIndex, currentWordIndex);
      }}
      wordStyle={({ token }) => {
        const cue = cueByIndex.get(token.wordIndex);
        return {
          "--teleprompter-accent": "#f97316",
          "--teleprompter-intensity": String(cue?.intensity ?? 0),
        } as CSSProperties;
      }}
    />
  );
}

function telepromptReadAlongWordRole(
  state: string | undefined,
  wordIndex: number,
  currentWordIndex?: number | null,
): ReadAlongWordRole {
  if (state === "active") {
    return "active";
  }
  if (state === "upcoming") {
    return "upcoming";
  }
  if (state === "spoken") {
    return typeof currentWordIndex === "number" && currentWordIndex - wordIndex <= 2
      ? "recent"
      : "spoken";
  }
  return "idle";
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
