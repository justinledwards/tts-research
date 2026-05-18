import type { ContentIRLocator, LocatorEnvelope } from "@tts-research/schema";
import {
  contentIRLocatorsMatch as sdkContentIRLocatorsMatch,
  formatContentIRLocator as sdkFormatContentIRLocator,
  locatorFromEnvelope as sdkLocatorFromEnvelope,
} from "@tts-research/sdk-ts";

export function formatContentIRLocator(locator: ContentIRLocator): string {
  return sdkFormatContentIRLocator(locator);
}

export function contentIRLocatorsMatch(
  left: ContentIRLocator | undefined,
  right: ContentIRLocator | undefined,
): boolean {
  return sdkContentIRLocatorsMatch(left, right);
}

export function locatorFromEnvelope(
  envelope: LocatorEnvelope | undefined,
): ContentIRLocator | undefined {
  return sdkLocatorFromEnvelope(envelope);
}
