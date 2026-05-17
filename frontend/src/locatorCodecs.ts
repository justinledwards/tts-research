import type {
  ContentIREPUBLocator,
  ContentIRLocator,
  LocatorEnvelope,
} from "./generated/contracts";

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
  const leftLocator = left;
  const rightLocator = right;
  if (
    leftLocator?.type === undefined ||
    rightLocator?.type === undefined ||
    leftLocator.type !== rightLocator.type
  ) {
    return false;
  }
  const leftEpub = effectiveEPUBLocator(leftLocator);
  const rightEpub = effectiveEPUBLocator(rightLocator);
  if (leftEpub || rightEpub) {
    return leftEpub?.href === rightEpub?.href && leftEpub?.fragment === rightEpub?.fragment;
  }
  if (leftLocator.html || rightLocator.html) {
    return (
      leftLocator.html?.href === rightLocator.html?.href &&
      leftLocator.html?.fragment === rightLocator.html?.fragment
    );
  }
  if (leftLocator.pdf || rightLocator.pdf) {
    return leftLocator.pdf?.pageIndex === rightLocator.pdf?.pageIndex;
  }
  if (leftLocator.ocr || rightLocator.ocr) {
    return leftLocator.ocr?.pageIndex === rightLocator.ocr?.pageIndex;
  }
  if (leftLocator.docx || rightLocator.docx) {
    return leftLocator.docx?.paragraphIndex === rightLocator.docx?.paragraphIndex;
  }
  if (leftLocator.markdown || rightLocator.markdown) {
    return (
      leftLocator.markdown?.path === rightLocator.markdown?.path &&
      leftLocator.markdown?.lineStart === rightLocator.markdown?.lineStart
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
