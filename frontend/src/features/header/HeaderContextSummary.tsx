import { useState, type ReactNode } from "react";

export interface HeaderContextMetadataItem {
  label: string;
  value: string;
}

export interface HeaderContextSummaryProps {
  className?: string;
  density?: "compact" | "comfortable";
  id?: string;
  icon?: ReactNode;
  metadata?: HeaderContextMetadataItem[];
  scopeTitle?: string | null;
  sourceTitle: string;
  stateLabel?: string | null;
  surfaceName: string;
  variant?: "bar" | "panel";
}

export function HeaderContextSummary({
  className = "",
  density = "comfortable",
  id,
  icon,
  metadata = [],
  scopeTitle,
  sourceTitle,
  stateLabel,
  surfaceName,
  variant = "panel",
}: Readonly<HeaderContextSummaryProps>) {
  const normalizedSourceTitle = nonEmptyLabel(sourceTitle, "No source selected");
  const normalizedScopeTitle = cleanOptionalLabel(scopeTitle) ?? "Full source";
  const normalizedStateLabel = cleanOptionalLabel(stateLabel);
  const ariaLabel = buildHeaderContextAriaLabel({
    metadata,
    scopeTitle: normalizedScopeTitle,
    sourceTitle: normalizedSourceTitle,
    stateLabel: normalizedStateLabel,
    surfaceName,
  });
  const isBar = variant === "bar";
  let textSizeClass = "text-lg";
  if (density === "compact") {
    textSizeClass = "text-sm sm:text-base";
  } else if (isBar) {
    textSizeClass = "text-base sm:text-lg";
  }

  return (
    <section
      aria-label={ariaLabel}
      className={`${isBar ? "flex min-w-0 items-center gap-3" : "grid min-w-0 gap-2"} ${className}`}
    >
      {icon ? <div className="shrink-0">{icon}</div> : null}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
            {surfaceName}
          </p>
          {normalizedStateLabel ? (
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold vs-border vs-muted"
              title={`State: ${normalizedStateLabel}`}
            >
              {normalizedStateLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <h2
            aria-label={`${surfaceName} source: ${normalizedSourceTitle}`}
            className={`min-w-0 truncate font-semibold text-[var(--vs-text)] ${textSizeClass}`}
            id={id}
            title={normalizedSourceTitle}
          >
            {normalizedSourceTitle}
          </h2>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs vs-muted">
          <span
            className="inline-flex min-w-0 max-w-full items-center gap-1 truncate"
            title={normalizedScopeTitle}
          >
            <span className="shrink-0 font-semibold">Scope</span>
            {normalizedScopeTitle}
          </span>
          {metadata.map((item) => (
            <span
              className="inline-flex min-w-0 max-w-full items-center gap-1 before:text-[var(--vs-muted)] before:content-['·'] sm:max-w-[14rem]"
              key={`${item.label}-${item.value}`}
              title={`${item.label}: ${item.value}`}
            >
              <span className="shrink-0 font-semibold">{item.label}</span>
              <span className="sr-only">: </span>
              <span className="min-w-0 truncate">{item.value}</span>
            </span>
          ))}
          <HeaderContextPopover
            metadata={metadata}
            scopeTitle={normalizedScopeTitle}
            sourceTitle={normalizedSourceTitle}
            stateLabel={normalizedStateLabel}
            surfaceName={surfaceName}
          />
        </div>
      </div>
    </section>
  );
}

function HeaderContextPopover({
  metadata,
  scopeTitle,
  sourceTitle,
  stateLabel,
  surfaceName,
}: Readonly<{
  metadata: HeaderContextMetadataItem[];
  scopeTitle: string;
  sourceTitle: string;
  stateLabel: string | null;
  surfaceName: string;
}>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details
      className="group relative shrink-0"
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open);
      }}
    >
      <summary
        aria-label={`Show full ${surfaceName} context`}
        className="grid h-7 w-7 cursor-pointer list-none place-items-center rounded-md border text-[0.68rem] font-semibold transition hover:border-orange-300 hover:text-orange-700 vs-border vs-raised [&::-webkit-details-marker]:hidden"
        title="Show full source and scope"
      >
        <InfoIcon />
      </summary>
      {isOpen ? (
        <div className="absolute left-1/2 z-30 mt-2 w-[min(22rem,86vw)] -translate-x-1/2 rounded-md border bg-[var(--vs-raised)] p-3 text-left text-xs shadow-xl vs-border">
          <dl className="grid gap-2">
            <ContextRow label="Surface" value={surfaceName} />
            <ContextRow label="Source" value={sourceTitle} />
            <ContextRow label="Scope" value={scopeTitle} />
            {stateLabel ? <ContextRow label="State" value={stateLabel} /> : null}
            {metadata.map((item) => (
              <ContextRow
                key={`${item.label}-${item.value}`}
                label={item.label}
                value={item.value}
              />
            ))}
          </dl>
        </div>
      ) : null}
    </details>
  );
}

function ContextRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
      <dt className="vs-muted">{label}</dt>
      <dd className="min-w-0 break-words font-semibold text-[var(--vs-text)]">{value}</dd>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M8 4.8h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function nonEmptyLabel(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function cleanOptionalLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function buildHeaderContextAriaLabel({
  metadata,
  scopeTitle,
  sourceTitle,
  stateLabel,
  surfaceName,
}: Readonly<{
  metadata: HeaderContextMetadataItem[];
  scopeTitle: string;
  sourceTitle: string;
  stateLabel: string | null;
  surfaceName: string;
}>) {
  return [
    surfaceName,
    `Source ${sourceTitle}`,
    `Scope ${scopeTitle}`,
    stateLabel ? `State ${stateLabel}` : null,
    ...metadata.map((item) => `${item.label} ${item.value}`),
  ]
    .filter(Boolean)
    .join(". ");
}
