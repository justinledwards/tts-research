import { formatContentIRLocator as formatLocator } from "@tts-research/sdk-ts";
import type { ContentIRLocator, ContentIRNode } from "@tts-research/schema";

export const CONTENT_IR_SCHEMA_VERSION = "content-ir.v1";

export type {
  ContentIRBBox,
  ContentIRDOCXLocator,
  ContentIRDocument,
  ContentIREPUBLocator,
  ContentIRExtractionProvenance,
  ContentIRHTMLLocator,
  ContentIRLocator,
  ContentIRMarkdownLocator,
  ContentIRNode,
  ContentIROCRLocator,
  ContentIROffsets,
  ContentIRPDFLocator,
  ContentIRPoint,
  ContentIRPronunciationRef,
  ContentIRProvenance,
  ContentIRRightsMetadata,
  ContentIRSchemaVersion,
  ContentIRSpeechMetadata,
  ContentIRSpeechPolicy,
  ContentIRSpeechPolicyHint,
  ContentIRUIHints,
  LocatorEnvelope,
  ReadiumLocator,
  SpeechPlanDocument,
} from "@tts-research/schema";

export function formatContentIRLocator(locator: ContentIRLocator): string {
  return formatLocator(locator);
}

export function contentIRNodePreview(node: ContentIRNode): string {
  const text = node.speechText.trim() || node.displayText.trim() || node.normalisedText.trim();
  return text.length > 180 ? `${text.slice(0, 179).trim()}...` : text;
}
