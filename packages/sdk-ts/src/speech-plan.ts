import type {
  ContentIRDocument,
  ContentIRNode,
  ContentIRPronunciationRef,
  ContentIRSpeechPolicy,
  LocatorEnvelope,
  SpeechPlanDocument,
  SpeechPlanHighlightMark,
  SpeechPlanPolicyTrace,
  SpeechPlanSegment,
} from "@tts-research/schema";
import { createLocatorEnvelope } from "./locator.js";

export interface BuildSpeechPlanOptions {
  activeWordStart?: number;
  generatedAt?: Date | string;
  id?: string;
  jobId?: string;
  locatorKind?: LocatorEnvelope["kind"];
  policyTrace?: SpeechPlanPolicyTrace[];
}

export function buildSpeechPlanFromContentIR(
  document: ContentIRDocument,
  options: BuildSpeechPlanOptions = {},
): SpeechPlanDocument {
  const generatedAt =
    options.generatedAt instanceof Date
      ? options.generatedAt.toISOString()
      : (options.generatedAt ?? new Date().toISOString());
  const trace = options.policyTrace?.length ? options.policyTrace : defaultTrace(document);
  const plan: SpeechPlanDocument = {
    schemaVersion: "speech-plan.v1",
    id: options.id?.trim() || document.id,
    sourceId: document.sourceId,
    projectId: document.projectId,
    generatedAt,
    policyTrace: trace,
    segments: [],
    metadata: {
      contentIrSchemaVersion: document.schemaVersion,
      sourceName: document.sourceName,
    },
  };
  if (options.jobId?.trim()) {
    plan.jobId = options.jobId.trim();
  }

  for (const node of document.nodes) {
    const text = node.speechText.trim();
    if (!text || node.speech.speechPolicy.mode.toLowerCase() === "skip") {
      continue;
    }
    const index = plan.segments.length + 1;
    const segmentId = `seg-${index.toString().padStart(4, "0")}`;
    const markId = node.markId?.trim() || `mark-${node.nodeId}`;
    const segment: SpeechPlanSegment = {
      segmentId,
      index,
      nodeId: node.nodeId,
      text,
      lang: node.lang?.trim() || "und",
      speechPolicy: node.speech.speechPolicy,
      policyTrace: trace,
      locatorEnvelope: createLocatorEnvelope(node.provenance.locator, {
        activeWordIndex: (options.activeWordStart ?? 0) + index - 1,
        kind: options.locatorKind ?? "highlight",
        nodeId: node.nodeId,
        position: index,
        sourceId: document.sourceId,
        textQuote: firstNonEmpty(node.normalisedText, node.displayText, node.speechText),
        title: document.sourceName,
      }),
      serializerTargets: {
        highlightMarks: [highlightMark(markId, node.nodeId, segmentId)],
        plainText: text,
        ssml: ssmlForNode(node, text),
      },
    };
    if (node.pronunciationRefs?.length) {
      segment.pronunciationRefs = node.pronunciationRefs;
    }
    if (node.lexiconEntryIds?.length) {
      segment.lexiconEntryIds = node.lexiconEntryIds;
      segment.serializerTargets.plsRefs = node.lexiconEntryIds;
    }
    if (node.warnings.length > 0) {
      segment.warnings = node.warnings;
    }
    plan.segments.push(segment);
  }
  return plan;
}

export function serializeSSML(text: string, lang = "en"): string {
  const cleanText = text.trim();
  if (!cleanText) {
    return "";
  }
  const cleanLang = lang.trim() || "en";
  return `<speak version="1.1" xml:lang="${escapeXML(cleanLang)}">${escapeXML(cleanText)}</speak>`;
}

function ssmlForNode(node: ContentIRNode, text: string): string {
  const rendered = speechRenderMetadata(node.metadata);
  if (typeof rendered?.ssml === "string" && rendered.ssml.trim()) {
    return rendered.ssml.trim();
  }
  return serializeSSML(text, node.lang || "en");
}

function speechRenderMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const raw = metadata?.speechRender;
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined;
}

function defaultTrace(document: ContentIRDocument): SpeechPlanPolicyTrace[] {
  const profile = firstNonEmpty(document.nodes[0]?.speech.speechPolicy.profile, "Enterprise");
  return [
    { scope: "marketProfileDefault", profile: "Enterprise" },
    { scope: "projectOverride", profile },
  ];
}

function highlightMark(markId: string, nodeId: string, segmentId: string): SpeechPlanHighlightMark {
  return { markId, nodeId, segmentId };
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value?.trim()) {
      return value.trim();
    }
  }
  return "";
}

function escapeXML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export type {
  ContentIRPronunciationRef,
  ContentIRSpeechPolicy,
  SpeechPlanDocument,
  SpeechPlanPolicyTrace,
};
