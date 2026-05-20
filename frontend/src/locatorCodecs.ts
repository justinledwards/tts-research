import type { ContentIREPUBLocator, ContentIRLocator, LocatorEnvelope } from "@tts-research/schema";

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
