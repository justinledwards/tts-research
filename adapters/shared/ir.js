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
      alphabet: block.alphabet,
      emphasis: block.emphasis,
      lexiconEntryIds: block.lexiconEntryIds,
      markId: block.markId,
      pauseAfterMs: block.pauseAfterMs,
      pauseBeforeMs: block.pauseBeforeMs,
      phoneme: block.phoneme,
      pronunciationRefs: block.pronunciationRefs,
      role: block.role,
      sayAs: block.sayAs,
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
  alphabet = "",
  emphasis = "",
  lexiconEntryIds = [],
  markId = "",
  pauseAfterMs = 0,
  pauseBeforeMs = 0,
  phoneme = "",
  pronunciationRefs = [],
  role,
  sayAs = "",
  sourceId,
  speechMode = "speak",
  speechText,
  start,
  warnings = [],
}) {
  const cleanDisplayText = normalizeText(displayText);
  const cleanSpeechText = normalizeText(speechText ?? cleanDisplayText);
  const node = {
    adapterVersion,
    ...(alphabet ? { alphabet } : {}),
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
    ...(lexiconEntryIds?.length ? { lexiconEntryIds: compactStringArray(lexiconEntryIds) } : {}),
    ...(markId ? { markId } : {}),
    ...(phoneme ? { phoneme } : {}),
    ...(pronunciationRefs?.length
      ? { pronunciationRefs: normalizePronunciationRefs(pronunciationRefs) }
      : {}),
    ...(sayAs ? { sayAs } : {}),
    script: "Latn",
    speech: {
      policyHint: {
        emphasis,
        mode: speechMode,
        pauseAfterMs,
        pauseBeforeMs,
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
  return node;
}

function normalizePronunciationRefs(refs) {
  return (refs ?? [])
    .map((ref) => ({
      term: String(ref.term ?? "").trim(),
      spoken: String(ref.spoken ?? "").trim(),
      ...(ref.source ? { source: String(ref.source).trim() } : {}),
      ...(ref.entryId ? { entryId: String(ref.entryId).trim() } : {}),
      ...(ref.scope ? { scope: String(ref.scope).trim() } : {}),
      ...(ref.protected ? { protected: Boolean(ref.protected) } : {}),
      startOffset: Number.isFinite(ref.startOffset) ? Math.max(0, Number(ref.startOffset)) : 0,
      endOffset: Number.isFinite(ref.endOffset) ? Math.max(0, Number(ref.endOffset)) : 0,
      originalText: String(ref.originalText ?? ref.term ?? "").trim(),
      ...(ref.phoneme ? { phoneme: String(ref.phoneme).trim() } : {}),
      ...(ref.alphabet ? { alphabet: String(ref.alphabet).trim() } : {}),
    }))
    .filter((ref) => ref.term && ref.spoken && ref.endOffset >= ref.startOffset);
}
