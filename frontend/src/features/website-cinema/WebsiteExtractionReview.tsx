import { Button, StatusChip } from "../../design";
import type { PreparedSource, WebsiteExtractionContainerCandidate } from "../../types";
import { websiteExtractionQuality, websiteExtractionTone } from "./WebsiteExtractionSummary";

export function WebsiteExtractionReview({
  source,
  onRerunExtraction,
}: Readonly<{
  source: PreparedSource;
  onRerunExtraction?: (source: PreparedSource, containerSelector: string) => void;
}>) {
  const quality = websiteExtractionQuality(source);
  if (!quality) {
    return (
      <div className="grid gap-3 text-sm">
        <p className="vs-muted">
          No Website Cinema extraction metadata is available for this source.
        </p>
      </div>
    );
  }
  const alternates = quality.alternateContainers ?? [];
  const skippedBlocks = quality.skippedBlocks ?? [];
  return (
    <div className="grid gap-4 text-sm" data-testid="website-extraction-review">
      {quality.articleUncertain ? (
        <div className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-[var(--vs-status-warning)]">
          Article uncertain. Review the selected container before generating long-form audio.
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">Chosen article region</p>
          <p className="truncate text-xs vs-muted" title={quality.chosenContainer}>
            {quality.chosenContainer}
          </p>
        </div>
        <StatusChip tone={websiteExtractionTone(quality)}>
          {quality.extractionConfidence.toUpperCase()}
        </StatusChip>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!onRerunExtraction}
          disabledReason="No re-fetch handler is available for this source."
          onClick={
            onRerunExtraction
              ? () => {
                  onRerunExtraction(source, "");
                }
              : undefined
          }
          size="sm"
          variant="secondary"
        >
          Re-fetch
        </Button>
        <Button
          disabled={!onRerunExtraction}
          disabledReason="No fallback handler is available for this source."
          onClick={
            onRerunExtraction
              ? () => {
                  onRerunExtraction(source, "__visible_text_only");
                }
              : undefined
          }
          size="sm"
          variant="secondary"
        >
          Use visible text only
        </Button>
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-xs">
        <MetricRow label="Candidates" value={quality.articleCandidateCount.toString()} />
        <MetricRow label="Narration blocks" value={quality.narrationBlockCount.toString()} />
        <MetricRow label="Skipped chrome" value={quality.skippedBlockCount.toString()} />
        <MetricRow label="Readable text" value={formatPercent(quality.readableTextRatio)} />
        <MetricRow label="Chrome text" value={formatPercent(quality.chromeTextRatio)} />
        <MetricRow label="Link density" value={formatPercent(quality.linkDensity)} />
        <MetricRow
          label="Heading depth"
          value={quality.headingDepth > 0 ? `H${quality.headingDepth.toString()}` : "None"}
        />
      </dl>
      {alternates.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] vs-muted">
            Alternate containers
          </p>
          <div className="grid gap-2">
            {alternates.map((candidate) => (
              <AlternateContainerButton
                candidate={candidate}
                key={candidate.selector}
                onRerunExtraction={
                  onRerunExtraction
                    ? () => {
                        onRerunExtraction(source, candidate.selector);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ) : null}
      <details className="grid gap-2 rounded-md border bg-[var(--vs-raised)] p-3 vs-border">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] vs-muted">
          Skipped chrome blocks
        </summary>
        <div className="mt-3 grid gap-2">
          {skippedBlocks.length > 0 ? (
            skippedBlocks.map((block) => (
              <div
                className="rounded-md border bg-[var(--vs-surface)] p-2 vs-border"
                key={block.selector}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{block.kind}</span>
                  <span className="text-xs vs-muted">{block.wordCount.toLocaleString()} words</span>
                </div>
                <p className="mt-1 text-xs vs-muted">{block.reason}</p>
                <p className="mt-1 line-clamp-3 text-xs leading-5">{block.text}</p>
              </div>
            ))
          ) : (
            <p className="text-xs vs-muted">No skipped chrome blocks were reported.</p>
          )}
        </div>
      </details>
    </div>
  );
}

function MetricRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <>
      <dt className="vs-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </>
  );
}

function AlternateContainerButton({
  candidate,
  onRerunExtraction,
}: Readonly<{
  candidate: WebsiteExtractionContainerCandidate;
  onRerunExtraction?: () => void;
}>) {
  return (
    <Button
      align="start"
      disabled={!onRerunExtraction}
      disabledReason="No rerun handler is available for this source."
      fullWidth
      onClick={onRerunExtraction}
      size="sm"
      variant="secondary"
    >
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate">{candidate.label}</span>
        <span className="truncate text-xs font-normal vs-muted">
          {candidate.reason} · {candidate.wordCount.toLocaleString()} words ·{" "}
          {formatPercent(candidate.linkDensity)} links
        </span>
      </span>
    </Button>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100).toString()}%`;
}
