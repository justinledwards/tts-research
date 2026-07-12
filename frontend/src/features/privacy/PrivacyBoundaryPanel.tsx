import type { ReactNode } from "react";
import { Panel, StatusChip } from "../../design";
import { cx } from "../../design/tokens";
import type { PrivacyBoundary, PrivacyBoundaryFact } from "./privacyModel";

export function PrivacyBoundaryPanel({
  boundaries,
  className,
  compact = false,
  title = "Privacy boundary",
}: Readonly<{
  boundaries: PrivacyBoundary | readonly PrivacyBoundary[];
  className?: string;
  compact?: boolean;
  title?: ReactNode;
}>) {
  const items: readonly PrivacyBoundary[] = Array.isArray(boundaries)
    ? (boundaries as readonly PrivacyBoundary[])
    : [boundaries as PrivacyBoundary];
  return (
    <Panel
      className={cx("grid gap-3 p-3", className)}
      data-privacy-boundary={items.map((item) => item.id).join(" ")}
      data-testid="privacy-boundary-panel"
      variant="surface"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Local-first data boundaries are shown before import, export, fetch, or generation.
          </p>
        </div>
        <StatusChip tone={items.some((item) => item.tone === "warning") ? "warning" : "success"}>
          {items.some((item) => item.tone === "warning") ? "Review boundary" : "Local-first"}
        </StatusChip>
      </div>

      <div className={cx("grid gap-2", !compact && "md:grid-cols-2")}>
        {items.map((item) => (
          <section className="grid gap-2 rounded-md border p-3 vs-border" key={item.id}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold" title={item.title}>
                {item.title}
              </p>
              <StatusChip tone={item.tone}>{item.status}</StatusChip>
            </div>
            <p className="vs-muted text-xs leading-5">{item.summary}</p>
            <dl className="grid gap-1 text-xs">
              {item.facts.map((fact) => (
                <PrivacyFact fact={fact} key={fact.label} />
              ))}
            </dl>
            <BoundaryList label="Included" values={item.included} />
            <BoundaryList label="Excluded" values={item.excluded} />
          </section>
        ))}
      </div>
    </Panel>
  );
}

function PrivacyFact({ fact }: Readonly<{ fact: PrivacyBoundaryFact }>) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="font-semibold text-[var(--vs-text)]">{fact.label}</dt>
      <dd className="break-words vs-muted">{fact.value}</dd>
    </div>
  );
}

function BoundaryList({ label, values }: Readonly<{ label: string; values?: readonly string[] }>) {
  if (!values || values.length === 0) {
    return null;
  }
  return (
    <div className="rounded-md border border-dashed p-2 text-xs vs-border">
      <p className="font-semibold">{label}</p>
      <ul className="mt-1 grid gap-1 vs-muted">
        {values.map((value) => (
          <li className="break-words" key={value}>
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}
