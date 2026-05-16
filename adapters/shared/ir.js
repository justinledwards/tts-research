export const CONTENT_IR_SCHEMA_VERSION = "content-ir.v1";

export function normalizeText(value) {
  return String(value ?? "")
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("ﬀ", "ff")
    .replaceAll("ﬁ", "fi")
    .replaceAll("ﬂ", "fl")
    .replaceAll("ﬃ", "ffi")
    .replaceAll("ﬄ", "ffl")
    .split("\n")
    .map((line) => line.trim().split(/\s+/).filter(Boolean).join(" "))
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

export function inlineText(value) {
  return normalizeText(value)
    .replaceAll(/\s*\n\s*/g, " ")
    .trim();
}

export function textQuote(value, maxLength = 120) {
  const text = inlineText(value);
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
}

export function wordCount(value) {
  return inlineText(value).split(/\s+/).filter(Boolean).length;
}

export function estimateDurationMs(words) {
  if (!Number.isFinite(words) || words <= 0) {
    return 0;
  }
  return Math.round((words / 155) * 60_000);
}

export function slugify(value, fallback = "section") {
  const slug = String(value ?? "")
    .normalize("NFKD")
    .replaceAll(/[^\dA-Za-z\s_-]/g, "")
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return slug || fallback;
}

export function uniqueSlug(value, used, fallback = "section") {
  const base = slugify(value, fallback);
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${String(index)}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

export function compactStringArray(values) {
  return [...new Set((values ?? []).map((item) => String(item ?? "").trim()).filter(Boolean))];
}

export function createDocument({
  adapterVersion,
  generatedAt,
  metadata = {},
  nodes,
  projectId = "",
  sourceId,
  sourceName,
  sourceType = "bookSource",
}) {
  return {
    adapterVersion,
    generatedAt: generatedAt ?? new Date().toISOString(),
    id: sourceId,
    metadata,
    nodes,
    projectId,
    schemaVersion: CONTENT_IR_SCHEMA_VERSION,
    sourceId,
    sourceName,
    sourceType,
  };
}

export function nodesFromBlocks(blocks, options) {
  const sourceId = options.sourceId;
  const adapterVersion = options.adapterVersion;
  const format = options.format;
  let offset = 0;
  return blocks.map((block, index) => {
    if (index > 0) {
      offset += 2;
    }
    const displayText = normalizeText(block.displayText ?? block.text ?? "");
    const speechText = normalizeText(block.speechText ?? displayText);
    const start = offset;
    const end = start + displayText.length;
    offset = end;
    return createNode({
      adapterVersion,
      confidence: block.confidence ?? 0.92,
      dir: block.dir ?? options.dir ?? "ltr",
      displayText,
      format,
      index,
      kind: block.kind ?? "body",
      lang: block.lang ?? options.lang ?? "und",
      locator: block.locator,
      metadata: block.metadata,
      nodeId: block.nodeId,
      parentId: block.parentId,
      role: block.role,
      sourceId,
      speechMode: block.speechMode,
      speechText,
      start,
      end,
      warnings: block.warnings,
    });
  });
}

export function createNode({
  adapterVersion,
  confidence = 0.92,
  dir = "ltr",
  displayText,
  end,
  format,
  index,
  kind,
  lang = "und",
  locator,
  metadata = {},
  nodeId,
  parentId = "",
  role,
  sourceId,
  speechMode = "speak",
  speechText,
  start,
  warnings = [],
}) {
  const cleanDisplayText = normalizeText(displayText);
  const cleanSpeechText = normalizeText(speechText ?? cleanDisplayText);
  return {
    adapterVersion,
    confidence,
    dir,
    displayText: cleanDisplayText,
    kind,
    lang,
    metadata,
    nodeId: nodeId || `${kind}-${String(index + 1).padStart(4, "0")}`,
    normalisedText: inlineText(cleanDisplayText),
    orderKey: String(index + 1).padStart(8, "0"),
    parentId,
    provenance: {
      format,
      locator,
      offsets: {
        end: Math.max(start, end),
        start: Math.max(0, start),
      },
      sourceId,
    },
    rights: {
      notes: "",
      status: "unknown",
    },
    role: role ?? kind,
    script: "Latn",
    speech: {
      policyHint: {
        emphasis: "",
        mode: speechMode,
        pauseAfterMs: 0,
        pauseBeforeMs: 0,
      },
      speechPolicy: {
        explanation: "Policy has not been evaluated yet.",
        mode: speechMode,
        profile: "Enterprise",
      },
    },
    speechText: cleanSpeechText,
    ui: {
      highlightUnitHint: "node",
      progressionHint: "linear",
    },
    warnings: compactStringArray(warnings),
  };
}
