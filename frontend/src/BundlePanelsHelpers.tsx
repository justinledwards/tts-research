import { type ReactNode } from "react";

import { formatDuration } from "./format";
import type {
  ProjectBundleImportResult,
  ProjectBundlePreview,
  ProjectBundleSummary,
} from "./types";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function PanelNote({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="mt-5 rounded-lg border p-4 text-sm vs-surface">{children}</p>;
}

export function PanelError({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="mt-5 rounded-lg border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] p-4 text-sm text-[var(--vs-status-danger)]">
      {children}
    </p>
  );
}

export function StepRail({
  activeStep,
  enabledSteps,
  onStepChange,
  steps,
}: Readonly<{
  activeStep: string;
  enabledSteps: string[];
  steps: readonly string[];
  onStepChange: (step: string) => void;
}>) {
  return (
    <ol className="mb-5 grid grid-cols-3 overflow-hidden rounded-lg border text-sm font-semibold vs-border">
      {steps.map((step) => {
        const isEnabled = enabledSteps.includes(step);
        return (
          <li key={step}>
            <button
              className={stepRailButtonClass(step, activeStep, isEnabled)}
              disabled={!isEnabled}
              onClick={() => {
                onStepChange(step);
              }}
              title={isEnabled ? step : `${step} unlocks after the previous step`}
              type="button"
            >
              {step}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function stepRailButtonClass(step: string, activeStep: string, isEnabled: boolean): string {
  const base = "h-full w-full px-3 py-2 text-center transition";
  if (step === activeStep) {
    return `${base} bg-[var(--vs-action-primary)] text-[var(--vs-action-primary-text)]`;
  }
  if (isEnabled) {
    return `${base} vs-surface hover:bg-[var(--vs-raised)]`;
  }
  return `${base} cursor-not-allowed opacity-45 vs-surface`;
}

export function SectionHeading({ subtitle, title }: Readonly<{ subtitle: string; title: string }>) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="vs-muted mt-1 text-sm leading-6">{subtitle}</p>
    </div>
  );
}

export function BundleContentRow({
  item,
}: Readonly<{ item: ProjectBundleSummary["contents"][number] }>) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-3 vs-raised">
      <span
        className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
          item.included
            ? "bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]"
            : "bg-[var(--vs-surface-muted)] text-[var(--vs-text-muted)]"
        }`}
      >
        {item.included ? "✓" : "·"}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" title={item.label}>
          {item.label}
        </p>
        <p className="vs-muted text-xs">{item.required ? "Required" : "Optional"}</p>
      </div>
      <span className="vs-muted shrink-0 text-xs">
        {item.estimatedBytes ? formatBytes(item.estimatedBytes) : ""}
      </span>
    </div>
  );
}

export function BundleStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border p-3 vs-raised">
      <dt className="vs-muted text-xs font-semibold uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function ExportReviewSummary({ summary }: Readonly<{ summary: ProjectBundleSummary }>) {
  return (
    <section className="grid gap-3 rounded-lg border p-4 vs-surface">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold" title={summary.projectName}>
            {summary.projectName}
          </h3>
          <p className="vs-muted mt-1 text-sm">
            {summary.chapterCount.toString()} chapter{summary.chapterCount === 1 ? "" : "s"} ·{" "}
            {summary.profileCount.toString()} voice{summary.profileCount === 1 ? "" : "s"} ·{" "}
            {formatDuration(summary.durationMs)}
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-semibold vs-border">
          {formatBytes(summary.estimatedBytes)}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <BundleStat label="Generated audio" value={summary.generatedAudio.toString()} />
        <BundleStat label="Manifest" value={summary.version.replace("voice-studio.", "")} />
        <BundleStat label="Compatibility" value="Portable v1" />
      </div>
    </section>
  );
}

export function ExportOptionalContent({
  optionalItems,
}: Readonly<{ optionalItems: ProjectBundleSummary["contents"] }>) {
  return (
    <details className="rounded-lg border p-4 vs-surface">
      <summary className="cursor-pointer text-sm font-semibold">Advanced optional content</summary>
      <div className="mt-3 grid gap-2">
        {optionalItems.length === 0 ? (
          <p className="vs-muted text-sm">No optional archival content is selected.</p>
        ) : (
          optionalItems.map((item) => <BundleContentRow item={item} key={item.key} />)
        )}
      </div>
    </details>
  );
}

export function ExportWarnings({ warnings }: Readonly<{ warnings: string[] }>) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <section className="rounded-lg border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] p-4 text-sm text-[var(--vs-status-warning)]">
      <p className="font-semibold">Review before sharing</p>
      <ul className="mt-2 grid gap-1">
        {warnings.map((warning) => (
          <li className="break-words" key={warning}>
            {warning}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImportResult({ result }: Readonly<{ result: ProjectBundleImportResult | null }>) {
  if (!result) {
    return null;
  }
  return (
    <section className="mt-5 rounded-lg border border-[var(--vs-status-success-border)] bg-[var(--vs-status-success-bg)] p-4 text-sm text-[var(--vs-status-success)]">
      <p className="font-semibold">Imported {result.project.name}</p>
      <p className="mt-1">
        {result.jobs.length.toString()} chapter{result.jobs.length === 1 ? "" : "s"} and{" "}
        {result.profiles.length.toString()} voice profile
        {result.profiles.length === 1 ? "" : "s"} are available.
      </p>
    </section>
  );
}

export function BundlePreviewCard({ preview }: Readonly<{ preview: ProjectBundlePreview }>) {
  const compatibility = preview.compatibility.length > 0 ? preview.compatibility : ["No flags"];
  return (
    <section className="mt-5 grid gap-3 rounded-lg border p-4 vs-surface">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold" title={preview.projectName}>
            {preview.projectName ?? "Unnamed bundle"}
          </h3>
          <p className="vs-muted mt-1 text-sm">
            {String(preview.chapterCount ?? 0)} chapter
            {preview.chapterCount === 1 ? "" : "s"} · {String(preview.profileCount ?? 0)} voice
            {preview.profileCount === 1 ? "" : "s"} · {formatBytes(preview.estimatedBytes ?? 0)}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            preview.valid
              ? "border-[var(--vs-status-success-border)] bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]"
              : "border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] text-[var(--vs-status-danger)]"
          }`}
        >
          {preview.valid ? "Valid" : "Blocked"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <BundleStat
          label="Quality"
          value={`${String(Math.round(preview.quality.overallScore * 100))}%`}
        />
        <BundleStat label="Duration" value={formatDuration(preview.quality.generatedDurationMs)} />
        <BundleStat label="Generated audio" value={String(preview.generatedAudio ?? 0)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {compatibility.map((flag) => (
          <span
            className="rounded-full border px-2.5 py-1 text-xs font-semibold vs-border"
            key={flag}
          >
            {flag}
          </span>
        ))}
      </div>
      {preview.warnings && preview.warnings.length > 0 ? (
        <ul className="grid gap-1 text-sm text-[var(--vs-status-warning)]">
          {preview.warnings.map((warning) => (
            <li className="break-words" key={warning}>
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
