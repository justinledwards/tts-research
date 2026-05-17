import { formatContentIRLocator as formatLocator } from "./locatorCodecs";
import type { ContentIRLocator, ContentIRNode } from "./generated/contracts";

export const CONTENT_IR_SCHEMA_VERSION = "content-ir.v1";
export const CONTENT_IR_SCHEMA_VERSION_V1_1 = "content-ir.v1_1";

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
} from "./generated/contracts";

export function formatContentIRLocator(locator: ContentIRLocator): string {
  return formatLocator(locator);
}

export function contentIRNodePreview(node: ContentIRNode): string {
  const text = node.speechText.trim() || node.displayText.trim() || node.normalisedText.trim();
  return text.length > 180 ? `${text.slice(0, 179).trim()}...` : text;
}
