import { StatusChip, type StatusChipTone } from "../../design";
import type { PreparedSource, WebsiteExtractionQuality } from "../../types";

export function WebsiteExtractionSummary({
  className = "",
  source,
}: Readonly<{
  className?: string;
  source: PreparedSource;
}>) {
  const quality = websiteExtractionQuality(source);
  if (!quality) {
    return null;
  }
  const tone = websiteExtractionTone(quality);
  return (
    <StatusChip className={className} tone={tone}>
      Article {quality.extractionConfidence}
      {quality.articleUncertain ? " uncertain" : ""}
    </StatusChip>
  );
}

export function websiteExtractionQuality(source: PreparedSource): WebsiteExtractionQuality | null {
  if (source.kind !== "url") {
    return null;
  }
  const quality = source.metadata?.websiteExtractionQuality;
  if (!isWebsiteExtractionQuality(quality)) {
    return null;
  }
  return quality;
}

export function websiteExtractionTone(quality: WebsiteExtractionQuality): StatusChipTone {
  if (quality.extractionConfidence === "high") {
    return "success";
  }
  if (quality.extractionConfidence === "medium") {
    return "warning";
  }
  return "danger";
}

function isWebsiteExtractionQuality(value: unknown): value is WebsiteExtractionQuality {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<WebsiteExtractionQuality>;
  return (
    typeof candidate.articleCandidateCount === "number" &&
    typeof candidate.chosenContainer === "string" &&
    typeof candidate.readableTextRatio === "number" &&
    typeof candidate.chromeTextRatio === "number" &&
    typeof candidate.linkDensity === "number" &&
    typeof candidate.headingDepth === "number" &&
    typeof candidate.skippedBlockCount === "number" &&
    typeof candidate.narrationBlockCount === "number" &&
    (candidate.extractionConfidence === "high" ||
      candidate.extractionConfidence === "medium" ||
      candidate.extractionConfidence === "low")
  );
}
