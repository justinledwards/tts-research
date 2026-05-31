import { useEffect, useMemo, useState } from "react";
import { Button, StatusChip, cx, fieldControlClassName } from "../../design";
import {
  readingSurfaceClassName,
  readingSurfaceDataAttributes,
  type ReadingSurfaceKind,
} from "../reading-surface";
import type { RevisionBlock } from "./revisionFilters";

export function InlineSpeechEdit({
  block,
  canRevert,
  currentSpokenText,
  onRevert,
  onSave,
}: Readonly<{
  block: RevisionBlock;
  canRevert: boolean;
  currentSpokenText: string;
  onRevert: () => void;
  onSave: (nextSpokenText: string) => void;
}>) {
  const [draft, setDraft] = useState(currentSpokenText);
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    setDraft(currentSpokenText);
    setIsPreviewing(false);
  }, [currentSpokenText]);

  const trimmedDraft = draft.trim();
  const trimmedCurrent = currentSpokenText.trim();
  const hasDraftChange = trimmedDraft !== trimmedCurrent && trimmedDraft.length > 0;
  const previewText = useMemo(
    () => trimmedDraft || currentSpokenText,
    [currentSpokenText, trimmedDraft],
  );

  return (
    <section
      aria-label={`Inline speech edit for ${block.label}`}
      className="grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border"
      data-testid="revision-inline-edit"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--vs-text)]">Inline Speech Edit</p>
          <p className="mt-1 truncate text-xs vs-muted" title={block.label}>
            Block {block.index.toString()} · {block.kind}
          </p>
        </div>
        <StatusChip tone={hasDraftChange ? "warning" : "neutral"}>
          {hasDraftChange ? "Unsaved" : "Current"}
        </StatusChip>
      </div>

      <label className="grid gap-1 text-sm font-semibold" htmlFor="revision-inline-edit-textarea">
        Spoken form
        <textarea
          className={cx(fieldControlClassName, "min-h-32 resize-y py-3 font-mono leading-6")}
          data-testid="revision-inline-edit-textarea"
          id="revision-inline-edit-textarea"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          value={draft}
        />
      </label>

      <div className="grid gap-2 md:grid-cols-2">
        <SpeechComparePane label="Current" surfaceKind="spoken" value={currentSpokenText} />
        <SpeechComparePane label="Draft" surfaceKind="spoken" value={draft} />
      </div>

      {isPreviewing ? (
        <output
          className={`block rounded-md bg-[var(--vs-raised)] p-3 ${readingSurfaceClassName(
            "spoken",
          )}`}
          data-testid="revision-inline-preview-output"
          {...readingSurfaceDataAttributes({ active: true, kind: "spoken" })}
        >
          {previewText}
        </output>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="ui-action-revision-inline-preview"
          onClick={() => {
            setIsPreviewing((current) => !current);
          }}
          size="sm"
          variant="secondary"
        >
          Preview changed sentence
        </Button>
        <Button
          data-testid="ui-action-revision-inline-save"
          disabled={!hasDraftChange}
          disabledReason={hasDraftChange ? undefined : "Change the spoken form before saving."}
          onClick={() => {
            onSave(trimmedDraft);
          }}
          size="sm"
          variant="soft"
        >
          Save edit
        </Button>
        <Button
          data-testid="ui-action-revision-inline-revert"
          disabled={!canRevert}
          disabledReason={canRevert ? undefined : "No saved inline edit to revert."}
          onClick={onRevert}
          size="sm"
          variant="secondary"
        >
          Revert
        </Button>
      </div>
    </section>
  );
}

function SpeechComparePane({
  label,
  surfaceKind,
  value,
}: Readonly<{ label: string; surfaceKind: ReadingSurfaceKind; value: string }>) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--vs-raised)] p-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p
        className={`mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words ${readingSurfaceClassName(
          surfaceKind,
        )}`}
        {...readingSurfaceDataAttributes({ kind: surfaceKind })}
      >
        {value || "No spoken text."}
      </p>
    </div>
  );
}
