import type { ReactNode } from "react";
import { StatusChip, type StatusChipTone } from "../../design";

export interface InspectorFact {
  readonly detail?: string;
  readonly label: string;
  readonly tone?: StatusChipTone;
  readonly value: string;
}

export interface InspectorNote {
  readonly detail: string;
  readonly label: string;
  readonly tone?: StatusChipTone;
}

type InspectorFactsAndNotesProps = Readonly<{
  facts: readonly InspectorFact[];
  notes?: readonly InspectorNote[];
}>;

type InspectorFactsNotesChildrenProps = Readonly<{
  children?: ReactNode;
  facts: readonly InspectorFact[];
  notes?: readonly InspectorNote[];
}>;

function InspectorFactsAndNotesSection({ facts, notes = [] }: InspectorFactsAndNotesProps) {
  return (
    <div className="grid gap-3">
      <InspectorFactList facts={facts} />
      <InspectorNoteList notes={notes} />
    </div>
  );
}

function InspectorFactsNotesChildrenSection({
  facts,
  notes = [],
  children,
}: InspectorFactsNotesChildrenProps) {
  return (
    <div className="grid gap-3">
      <InspectorFactList facts={facts} />
      <InspectorNoteList notes={notes} />
      {children}
    </div>
  );
}

export const SourceInspectorSection = InspectorFactsAndNotesSection;
export const VoiceInspectorSection = InspectorFactsAndNotesSection;
export const HistoryInspectorSection = InspectorFactsAndNotesSection;
export const PolicyInspectorSection = InspectorFactsNotesChildrenSection;
export const DiagnosticsInspectorSection = InspectorFactsNotesChildrenSection;

export function QueueInspectorSection({
  facts,
  notes = [],
  children,
}: Readonly<{
  children?: ReactNode;
  facts: readonly InspectorFact[];
  notes?: readonly InspectorNote[];
}>) {
  return (
    <div className="grid gap-3">
      <InspectorFactList facts={facts} />
      {children}
      <InspectorNoteList notes={notes} />
    </div>
  );
}

export function InspectorFactList({ facts }: Readonly<{ facts: readonly InspectorFact[] }>) {
  if (facts.length === 0) {
    return null;
  }
  return (
    <dl className="grid gap-2 text-xs">
      {facts.map((fact) => (
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2" key={fact.label}>
          <dt className="vs-muted">{fact.label}</dt>
          <dd className="min-w-0">
            {fact.tone ? (
              <StatusChip
                className="max-w-full whitespace-normal py-0.5 text-left text-[0.65rem] break-words"
                tone={fact.tone}
              >
                <span title={fact.value}>{fact.value}</span>
              </StatusChip>
            ) : (
              <span
                className="block font-semibold break-words text-[var(--vs-text)]"
                title={fact.value}
              >
                {fact.value}
              </span>
            )}
            {fact.detail ? (
              <span className="mt-1 block leading-5 break-words vs-muted">{fact.detail}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function InspectorNoteList({ notes }: Readonly<{ notes: readonly InspectorNote[] }>) {
  if (notes.length === 0) {
    return null;
  }
  return (
    <ul className="grid gap-2 text-xs leading-5">
      {notes.map((note) => (
        <li
          className="rounded-md border bg-[var(--vs-surface)] px-3 py-2 vs-border"
          key={note.label}
        >
          <span className="font-semibold text-[var(--vs-text)]">{note.label}: </span>
          <span className="break-words vs-muted">{note.detail}</span>
          {note.tone ? (
            <StatusChip className="ml-2 py-0.5 text-[0.65rem]" tone={note.tone}>
              {note.tone}
            </StatusChip>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
