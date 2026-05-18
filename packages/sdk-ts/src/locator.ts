import type {
  ContentIREPUBLocator,
  ContentIRLocator,
  LocatorEnvelope,
  ReadiumLocator,
} from "@tts-research/schema";

export interface LocatorEnvelopeContext {
  activeWordIndex?: number;
  kind?: LocatorEnvelope["kind"];
  nodeId?: string;
  position?: number;
  scopeKey?: string;
  sourceId: string;
  textQuote?: string;
  title?: string;
  totalProgression?: number;
}

export function formatContentIRLocator(locator: ContentIRLocator): string {
  if (locator.markdown) {
    const range =
      locator.markdown.lineStart === locator.markdown.lineEnd
        ? `line ${locator.markdown.lineStart.toString()}`
        : `lines ${locator.markdown.lineStart.toString()}-${locator.markdown.lineEnd.toString()}`;
    return `${locator.markdown.path}:${range}`;
  }
  const epub = effectiveEPUBLocator(locator);
  if (epub) {
    const suffix = epub.fragment ? `#${epub.fragment}` : "";
    return `${epub.href}${suffix}`;
  }
  if (locator.html) {
    const suffix = locator.html.fragment ? `#${locator.html.fragment}` : "";
    return `${locator.html.href}${suffix}`;
  }
  if (locator.pdf) {
    return `page ${(locator.pdf.pageIndex + 1).toString()}`;
  }
  if (locator.docx) {
    return `paragraph ${(locator.docx.paragraphIndex + 1).toString()}`;
  }
  if (locator.ocr) {
    return `page ${(locator.ocr.pageIndex + 1).toString()} · ${locator.ocr.ocrEngine}`;
  }
  return locator.type;
}

export function contentIRLocatorsMatch(
  left: ContentIRLocator | undefined,
  right: ContentIRLocator | undefined,
): boolean {
  if (!left?.type || !right?.type || left.type !== right.type) {
    return false;
  }
  const leftEpub = effectiveEPUBLocator(left);
  const rightEpub = effectiveEPUBLocator(right);
  if (leftEpub || rightEpub) {
    return leftEpub?.href === rightEpub?.href && leftEpub?.fragment === rightEpub?.fragment;
  }
  if (left.html || right.html) {
    return left.html?.href === right.html?.href && left.html?.fragment === right.html?.fragment;
  }
  if (left.pdf || right.pdf) {
    return left.pdf?.pageIndex === right.pdf?.pageIndex;
  }
  if (left.ocr || right.ocr) {
    return left.ocr?.pageIndex === right.ocr?.pageIndex;
  }
  if (left.docx || right.docx) {
    return left.docx?.paragraphIndex === right.docx?.paragraphIndex;
  }
  if (left.markdown || right.markdown) {
    return (
      left.markdown?.path === right.markdown?.path &&
      left.markdown?.lineStart === right.markdown?.lineStart
    );
  }
  return false;
}

export function locatorFromEnvelope(
  envelope: LocatorEnvelope | undefined,
): ContentIRLocator | undefined {
  return envelope?.locator;
}

export function createLocatorEnvelope(
  locator: ContentIRLocator | undefined,
  context: LocatorEnvelopeContext,
): LocatorEnvelope {
  const envelope: LocatorEnvelope = {
    schemaVersion: "locator-envelope.v1",
    kind: context.kind ?? "resume",
    sourceId: context.sourceId.trim(),
  };
  if (context.nodeId?.trim()) {
    envelope.nodeId = context.nodeId.trim();
  }
  if (context.scopeKey?.trim()) {
    envelope.scopeKey = context.scopeKey.trim();
  }
  if (context.activeWordIndex !== undefined) {
    envelope.activeWordIndex = context.activeWordIndex;
  }
  if (locator) {
    envelope.locator = locator;
    const readium = exportReadiumLocator(locator, context);
    if (readium.href && readium.type) {
      envelope.readium = readium;
    }
  }
  if (context.textQuote?.trim()) {
    envelope.textQuote = context.textQuote.trim();
  }
  return envelope;
}

export function exportReadiumLocator(
  locator: ContentIRLocator,
  context: LocatorEnvelopeContext,
): ReadiumLocator {
  const textQuote = firstNonEmpty(context.textQuote, locatorTextQuote(locator));
  const output: ReadiumLocator = {
    href: "",
    locations: {},
    type: "",
  };
  if (context.title?.trim()) {
    output.title = context.title.trim();
  }
  if (textQuote) {
    output.text = { highlight: textQuote };
  }
  if (context.position && context.position > 0) {
    output.locations = { ...output.locations, position: context.position };
  }
  if (context.totalProgression !== undefined) {
    output.locations = { ...output.locations, totalProgression: context.totalProgression };
  }

  switch (locator.type) {
    case "epub": {
      const epub = effectiveEPUBLocator(locator);
      if (!epub) {
        return emptyReadiumLocator();
      }
      output.href = epub.href;
      output.type = "application/xhtml+xml";
      output.locations = { ...output.locations, progression: epub.progression };
      if (epub.fragment?.trim()) {
        output.locations.fragments = [epub.fragment.trim()];
        output.locations.cssSelector = `#${epub.fragment.trim()}`;
      }
      const partialCfi = partialCFI(epub.epubCfi);
      if (partialCfi) {
        output.locations.partialCfi = partialCfi;
      }
      return output;
    }
    case "html":
      if (!locator.html) {
        return emptyReadiumLocator();
      }
      output.href = locator.html.href;
      output.type = "text/html";
      output.locations = { ...output.locations, progression: locator.html.progression };
      if (locator.html.fragment?.trim()) {
        output.locations.fragments = [locator.html.fragment.trim()];
        output.locations.cssSelector = `#${locator.html.fragment.trim()}`;
      }
      return output;
    case "pdf": {
      if (!locator.pdf) {
        return emptyReadiumLocator();
      }
      const page = locator.pdf.pageIndex + 1;
      output.href = firstNonEmpty(context.sourceId, "document.pdf");
      output.type = "application/pdf";
      output.title = firstNonEmpty(output.title, `Page ${page.toString()}`);
      output.locations = {
        ...output.locations,
        fragments: [`page=${page.toString()}`],
        position: firstPositive(context.position, page),
      };
      if (locator.pdf.bbox) {
        const bbox = locator.pdf.bbox;
        output.locations.fragments?.push(
          `viewrect=${readiumNumber(bbox.x)},${readiumNumber(bbox.y)},${readiumNumber(
            bbox.width,
          )},${readiumNumber(bbox.height)}`,
        );
      }
      return output;
    }
    case "ocr": {
      if (!locator.ocr) {
        return emptyReadiumLocator();
      }
      const page = locator.ocr.pageIndex + 1;
      output.href = firstNonEmpty(context.sourceId, "image-set");
      output.type = "image/*";
      output.title = firstNonEmpty(output.title, `Page ${page.toString()}`);
      output.locations = {
        ...output.locations,
        fragments: [`page=${page.toString()}`],
        position: firstPositive(context.position, page),
      };
      return output;
    }
    case "markdown":
      if (!locator.markdown) {
        return emptyReadiumLocator();
      }
      output.href = locator.markdown.path;
      output.type = "text/markdown";
      output.locations = {
        ...output.locations,
        fragments: [`line=${locator.markdown.lineStart.toString()}`],
        position: firstPositive(context.position, locator.markdown.lineStart),
      };
      return output;
    case "docx":
      if (!locator.docx) {
        return emptyReadiumLocator();
      }
      output.href = firstNonEmpty(context.sourceId, "document.docx");
      output.type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      output.locations = {
        ...output.locations,
        fragments: [`paragraph=${(locator.docx.paragraphIndex + 1).toString()}`],
        position: firstPositive(context.position, locator.docx.paragraphIndex + 1),
      };
      return output;
    default:
      return emptyReadiumLocator();
  }
}

function effectiveEPUBLocator(locator: ContentIRLocator): ContentIREPUBLocator | undefined {
  if (locator.epub) {
    return locator.epub;
  }
  if (locator.type !== "epub" || !locator.html) {
    return undefined;
  }
  return {
    epubCfi: locator.html.epubCfi,
    fragment: locator.html.fragment,
    href: locator.html.href,
    progression: locator.html.progression,
    textQuote: locator.html.textQuote,
  };
}

function locatorTextQuote(locator: ContentIRLocator): string {
  return firstNonEmpty(locator.epub?.textQuote, locator.html?.textQuote);
}

function partialCFI(value: string | undefined): string {
  let trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  trimmed = trimmed.replace(/^epubcfi\(/, "").replace(/\)$/, "");
  const index = trimmed.indexOf("!");
  return index >= 0 && index + 1 < trimmed.length ? trimmed.slice(index + 1) : trimmed;
}

function readiumNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toString();
}

function emptyReadiumLocator(): ReadiumLocator {
  return { href: "", type: "" };
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value?.trim()) {
      return value.trim();
    }
  }
  return "";
}

function firstPositive(...values: Array<number | undefined>): number | undefined {
  for (const value of values) {
    if (value !== undefined && value > 0) {
      return value;
    }
  }
  return undefined;
}
