import type { VoiceJob } from "../../types";
import { StatusChip } from "../../design";
import type { AlignmentRepairMap, AlignmentRepairStaleReport } from "./alignmentRepairModel";
import { alignmentRepairOperationLabel, alignmentRepairSummary } from "./alignmentRepairModel";
import type { ReadAlongRuntimeSnapshot } from "./readAlongState";
import { readAlongRuntimeDebugRows, readAlongRuntimeStateLabel } from "./readAlongState";
import { buildSpeechFluencyDiagnostics } from "./speechFluencyDiagnostics";

export interface AlignmentDiagnosticsSkippedItem {
  count: number;
  label: string;
}

export function AlignmentDiagnosticsPanel({
  job,
  repairMap,
  repairStaleness,
  runtime,
  skippedPolicyContent = [],
}: Readonly<{
  job?: VoiceJob | null;
  repairMap?: AlignmentRepairMap | null;
  repairStaleness?: AlignmentRepairStaleReport;
  runtime?: ReadAlongRuntimeSnapshot | null;
  skippedPolicyContent?: readonly AlignmentDiagnosticsSkippedItem[];
}>) {
  const fragments = job?.timing?.fragmentTiming?.fragments ?? [];
  const tokens = job?.timing?.tokenTiming?.tokens ?? [];
  const alignmentQuality = job?.timing?.alignmentQuality;
  const summary = job?.timing?.summary;
  const drift = alignmentQuality?.drift ?? summary?.drift;
  const confidence = alignmentQuality?.confidence ?? summary?.confidence;
  const speechFluency = buildSpeechFluencyDiagnostics(job);
  const totalDurationMs = Math.max(
    1,
    alignmentQuality?.durationMs ?? summary?.durationMs ?? job?.durationMs ?? 1,
  );
  const currentTokenLabel =
    runtime?.activeCue?.token?.text ??
    (runtime?.activeTokenIndex !== null && runtime?.activeTokenIndex !== undefined
      ? tokens.find((token) => token.index === runtime.activeTokenIndex)?.text
      : null) ??
    "None";
  const expectedTokenLabel =
    runtime?.expectedCue?.token?.text ??
    (runtime?.expectedTokenIndex !== null && runtime?.expectedTokenIndex !== undefined
      ? tokens.find((token) => token.index === runtime.expectedTokenIndex)?.text
      : null) ??
    "None";
  let staleReason: string | null = null;
  if (runtime?.state === "stale-audio") {
    staleReason = runtime.reason;
  } else if (repairStaleness?.stale) {
    staleReason = repairStaleness.reason ?? null;
  }

  return (
    <div className="grid gap-4 text-sm" data-alignment-diagnostics-panel="">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={alignmentQuality?.wordTimingReliable ? "success" : "warning"}>
          {alignmentQuality?.primaryLevel ?? summary?.mode ?? "No timing"}
        </StatusChip>
        <StatusChip tone={repairStaleness?.stale ? "warning" : "info"}>
          {repairStaleness?.stale ? "Repair stale" : "Repair local"}
        </StatusChip>
        {runtime ? (
          <StatusChip tone="info">{readAlongRuntimeStateLabel(runtime)}</StatusChip>
        ) : null}
      </div>

      {staleReason ? (
        <p className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-xs leading-5 text-[var(--vs-status-warning)] dark:text-[var(--vs-status-warning)]">
          {staleReason}
        </p>
      ) : null}

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] vs-muted">Audio timeline</p>
        <div className="overflow-hidden rounded-md border bg-[var(--vs-raised)] p-2 vs-border">
          <div
            className="flex h-7 gap-0.5"
            role="img"
            aria-label={`Alignment audio timeline with ${fragments.length.toLocaleString()} fragments`}
          >
            {fragments.slice(0, 16).map((fragment) => {
              const width = Math.max(
                3,
                ((fragment.endMs - fragment.startMs) / totalDurationMs) * 100,
              );
              const active = runtime?.activeCue?.fragmentIndex === fragment.index;
              return (
                <span
                  aria-hidden="true"
                  className={`block min-w-[0.4rem] rounded-sm ${
                    active
                      ? "bg-[var(--vs-action-primary)]"
                      : "bg-[var(--vs-action-disabled-bg)] dark:bg-[var(--vs-action-disabled-bg)]"
                  }`}
                  key={`${String(fragment.index)}:${String(fragment.startMs)}`}
                  style={{ width: `${width.toFixed(2)}%` }}
                  title={fragment.text}
                />
              );
            })}
          </div>
          <p className="mt-2 text-xs vs-muted">
            {fragments.length.toLocaleString()} fragments, {tokens.length.toLocaleString()} tokens,
            duration {Math.round(totalDurationMs / 1000).toLocaleString()}s
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <MetricRow label="Active token" value={currentTokenLabel} />
        <MetricRow label="Expected token" value={expectedTokenLabel} />
        <MetricRow
          label="Timing source"
          value={alignmentQuality?.timingSourceV2 ?? summary?.source ?? "unknown"}
        />
        <MetricRow label="Confidence" value={formatPercent(confidence?.overall)} />
        <MetricRow label="Max drift" value={formatMs(drift?.maxAbsoluteMs)} />
        <MetricRow label="Mean drift" value={formatMs(drift?.meanAbsoluteMs)} />
      </dl>

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] vs-muted">Drift chart</p>
        <BarMetric
          label="Mean"
          max={350}
          tone="bg-[var(--vs-status-success)]"
          value={drift?.meanAbsoluteMs ?? 0}
        />
        <BarMetric
          label="Max"
          max={350}
          tone={
            (drift?.maxAbsoluteMs ?? 0) > 150
              ? "bg-[var(--vs-status-warning)]"
              : "bg-[var(--vs-status-success)]"
          }
          value={drift?.maxAbsoluteMs ?? 0}
        />
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] vs-muted">
          Confidence chart
        </p>
        <BarMetric
          label="Overall"
          max={1}
          tone="bg-[var(--vs-status-info)]"
          value={confidence?.overall ?? 0}
        />
        <BarMetric
          label="Segment"
          max={1}
          tone="bg-[var(--vs-status-info)]"
          value={confidence?.segment ?? 0}
        />
        <BarMetric
          label="Token"
          max={1}
          tone="bg-[var(--vs-status-info)]"
          value={confidence?.token ?? 0}
        />
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] vs-muted">
          Segment seam quality
        </p>
        <div
          className="grid gap-3 rounded-md border bg-[var(--vs-raised)] p-3 text-xs vs-border"
          data-testid="speech-fluency-diagnostics"
        >
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <MetricRow label="Segment seam quality" value={speechFluency.segmentSeamQuality} />
            <MetricRow label="Pause model" value={speechFluency.pauseModel} />
            <MetricRow label="Duration estimate" value={speechFluency.durationEstimate} />
            <MetricRow
              label="Potential clipped audio"
              value={speechFluency.potentialClippedAudio}
            />
          </dl>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 vs-border">
            {speechFluency.rows.map((row) => (
              <MetricRow key={`${row.label}:${row.value}`} label={row.label} value={row.value} />
            ))}
          </dl>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] vs-muted">Runtime debug</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {readAlongRuntimeDebugRows(runtime).map((row) => (
            <MetricRow key={`${row.label}:${row.value}`} label={row.label} value={row.value} />
          ))}
        </dl>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] vs-muted">
          Skipped policy content
        </p>
        {skippedPolicyContent.length > 0 ? (
          <ul className="grid gap-1 text-xs">
            {skippedPolicyContent.map((item) => (
              <li className="flex justify-between gap-3" key={item.label}>
                <span className="truncate">{item.label}</span>
                <span className="font-semibold">{item.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs vs-muted">No skipped policy content is active.</p>
        )}
      </div>

      <p className="rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs leading-5 vs-border">
        {alignmentRepairSummary(repairMap)}
      </p>

      <ActiveRepairWorkflow repairMap={repairMap} />
    </div>
  );
}

function ActiveRepairWorkflow({ repairMap }: Readonly<{ repairMap?: AlignmentRepairMap | null }>) {
  if (!repairMap || (repairMap.candidates.length === 0 && repairMap.operations.length === 0)) {
    return null;
  }
  const candidates = repairMap.candidates.slice(-3);
  const operations = repairMap.operations.slice(-3);
  return (
    <div
      className="grid gap-2 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs leading-5 vs-border"
      data-testid="alignment-active-repairs"
    >
      <p className="font-semibold">Active repair workflow</p>
      {candidates.length > 0 ? (
        <ul className="grid gap-1">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              Candidate at {candidate.audioTimestamp}: expected{" "}
              {formatQuoted(candidate.expectedVisibleWord)}, highlighted{" "}
              {formatQuoted(candidate.actualHighlightedWord)}.
            </li>
          ))}
        </ul>
      ) : null}
      {operations.length > 0 ? (
        <ul className="grid gap-1">
          {operations.map((operation) => (
            <li key={operation.id}>
              {alignmentRepairOperationLabel(operation.kind)}: {operation.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="vs-muted">
        Repairs are local project artifacts; source, speech plan, or audio changes make them stale
        until reviewed again.
      </p>
    </div>
  );
}

function MetricRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="contents">
      <dt className="vs-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function BarMetric({
  label,
  max,
  tone,
  value,
}: Readonly<{ label: string; max: number; tone: string; value: number }>) {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return (
    <div className="grid gap-1 text-xs">
      <div className="flex justify-between gap-3">
        <span>{label}</span>
        <span className="vs-muted">{max === 1 ? formatPercent(value) : formatMs(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--vs-border-subtle)] dark:bg-[var(--vs-surface-muted)]">
        <span
          className={`block h-full ${tone}`}
          style={{ width: `${(ratio * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

function formatMs(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `${Math.round(value).toLocaleString()}ms`;
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "-"
    : `${Math.round(value * 100).toLocaleString()}%`;
}

function formatQuoted(value: string | null): string {
  return value ? `"${value}"` : "unknown";
}
