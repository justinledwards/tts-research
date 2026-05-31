import { useId } from "react";
import { formatPolicyModeLabel } from "../../policy";
import type { PreparedSourceCinemaPolicyNote } from "../preparedSourcePolicyNotes";

export function PreparedSourcePolicyNotes({
  notes,
}: Readonly<{ notes: PreparedSourceCinemaPolicyNote[] }>) {
  const headingId = useId();
  if (notes.length === 0) {
    return <p className="vs-muted text-sm">No policy notes for this source.</p>;
  }
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-3 text-sm"
      id="prepared-source-policy-notes"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="vs-muted text-xs font-semibold uppercase tracking-[0.2em]" id={headingId}>
          Policy Notes
        </p>
        <span className="text-xs font-semibold text-[var(--vs-action-primary)]">
          {notes.length.toString()}
        </span>
      </div>
      <div className="grid gap-2">
        {notes.slice(0, 8).map((note) => (
          <article className="rounded-md border px-3 py-2 text-xs vs-border" key={note.id}>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="truncate font-semibold" title={note.title}>
                {note.title}
              </p>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] vs-border">
                {formatPolicyModeLabel(note.mode)}
              </span>
            </div>
            <p className="vs-muted mt-1 leading-5">{note.explanation}</p>
            {note.text ? (
              <p className="mt-2 line-clamp-2 text-[0.7rem] leading-5" title={note.text}>
                {note.text}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
