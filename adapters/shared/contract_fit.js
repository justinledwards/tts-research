export const CONTRACT_FIT_REPORT_SCHEMA_VERSION = "adapter-contract-fit-report.v1";
export const READALONG_CONTRACT_PROFILE = "readalong-sidecar-fit.v1";

const BASE_WARNINGS = [
  {
    code: "lower_tier_adapter",
    message:
      "This adapter is reported as a lower-tier contract-fit path; readable output may be useful but is not equivalent to the core HTML/EPUB/Markdown lanes.",
    severity: "warning",
  },
  {
    code: "no_best_in_class_claim",
    message:
      "This report does not claim best-in-class extraction quality for DOCX, PDF, or OCR sources.",
    severity: "warning",
  },
  {
    code: "exact_sync_not_claimed",
    message:
      "Exact word sync is not claimed from this adapter report; sync fidelity must be gated separately.",
    severity: "warning",
  },
];

const BASE_NON_CLAIMS = [
  "best_in_class_docx_pdf_ocr",
  "exact_word_sync_ready",
  "durable_manifest_snapshot_runtime",
  "lossless_layout_or_semantics",
];

const BASE_GAPS = [
  {
    contractExpectation: "reading-unit-manifest.v1",
    id: "manifest_sidecars_not_emitted",
    message:
      "The adapter output may be converted into manifest sidecars later, but this report does not emit durable ReadingUnitManifest or ReadalongManifest snapshots.",
    severity: "warning",
  },
  {
    contractExpectation: "sync-fidelity-decision.v1",
    id: "sync_fidelity_requires_later_evidence",
    message:
      "Highlight/sync fidelity requires a later SyncFidelityDecision with timing and mapping evidence; this report only records adapter contract fit.",
    severity: "warning",
  },
];

const SOURCE_KIND_PRESETS = {
  docx: {
    gaps: [
      {
        contractExpectation: "content-ir.v1 stable identity",
        id: "docx_identity_is_paragraph_derived",
        message:
          "DOCX unit identity is derived from extracted paragraph/table/note order and metadata, so compatible-edit stability is lower-tier rather than a core-adapter guarantee.",
        severity: "warning",
      },
      {
        contractExpectation: "locator-envelope.v1",
        id: "docx_layout_semantics_degraded",
        message:
          "DOCX layout, drawings, complex tables, comments, footnotes, and endnotes are summarized into readable units instead of preserving full source semantics.",
        severity: "info",
      },
    ],
    nonClaims: ["best_in_class_docx", "complete_wordprocessingml_semantics"],
    supportedFeatures: [
      "content_ir_v1_output",
      "docx_paragraph_locators",
      "docx_note_and_comment_warnings",
      "docx_table_and_image_summary_units",
    ],
    warnings: [
      {
        code: "docx_lower_tier_contract_fit",
        message:
          "DOCX is represented as a lower-tier contract-fit adapter, not a best-in-class extraction lane.",
        severity: "warning",
      },
    ],
  },
  ocr: {
    gaps: [
      {
        contractExpectation: "locator-envelope.v1",
        id: "ocr_text_confidence_degraded",
        message:
          "OCR text and polygon evidence can be uncertain; downstream readiness and sync fidelity must retain OCR confidence warnings.",
        severity: "warning",
      },
      {
        contractExpectation: "content-ir.v1 reading order",
        id: "ocr_reading_order_not_core",
        message:
          "OCR reading order is lower-tier and may require manual or later layout evidence before narration claims.",
        severity: "warning",
      },
    ],
    nonClaims: ["best_in_class_ocr", "complete_ocr_accuracy", "exact_ocr_layout_reconstruction"],
    supportedFeatures: [
      "content_ir_v1_output",
      "ocr_locators_with_confidence",
      "ocr_uncertainty_warnings",
      "source_only_readable_units_when_text_exists",
    ],
    warnings: [
      {
        code: "ocr_lower_tier_contract_fit",
        message:
          "OCR is represented as a lower-tier contract-fit path with explicit uncertainty warnings.",
        severity: "warning",
      },
    ],
  },
  pdf: {
    gaps: [
      {
        contractExpectation: "content-ir.v1 reading order",
        id: "pdf_reading_order_degraded",
        message:
          "PDF reading order, multi-column layout, tables, figures, and scholarly structure are lower-tier heuristics unless later evidence promotes them.",
        severity: "warning",
      },
      {
        contractExpectation: "locator-envelope.v1",
        id: "pdf_locator_fidelity_varies_by_tier",
        message:
          "PDF locator fidelity varies by tagged, born-digital, scanned, scholarly, or image/OCR strategy and is not a core-adapter guarantee.",
        severity: "warning",
      },
    ],
    nonClaims: [
      "best_in_class_pdf",
      "complete_pdf_layout_reconstruction",
      "semantic_pdf_tag_correctness",
    ],
    supportedFeatures: [
      "content_ir_v1_output",
      "pdf_or_ocr_locators",
      "support_tier_metadata",
      "confidence_and_warning_metadata",
    ],
    warnings: [
      {
        code: "pdf_lower_tier_contract_fit",
        message:
          "PDF is represented as a lower-tier contract-fit adapter, not a best-in-class extraction lane.",
        severity: "warning",
      },
    ],
  },
};

export function createLowerTierContractFitReport(options) {
  const sourceKind = normalizeKind(options.sourceKind ?? options.adapterId);
  const preset = SOURCE_KIND_PRESETS[sourceKind] ?? SOURCE_KIND_PRESETS.pdf;
  const warningInputs = [...BASE_WARNINGS, ...preset.warnings, ...(options.warnings ?? [])];
  const gapInputs = [...BASE_GAPS, ...preset.gaps, ...(options.gaps ?? [])];
  const nonClaims = [...BASE_NON_CLAIMS, ...preset.nonClaims, ...(options.nonClaims ?? [])];
  const supportedFeatureIds = [...preset.supportedFeatures, ...(options.supportedFeatureIds ?? [])];
  return {
    schemaVersion: CONTRACT_FIT_REPORT_SCHEMA_VERSION,
    adapter: {
      id: String(options.adapterId ?? sourceKind),
      sourceKind,
      supportTier: "lower-tier",
      version: String(options.adapterVersion ?? ""),
      ...(options.extractionPath ? { extractionPath: String(options.extractionPath) } : {}),
      ...(options.supportTierLabel ? { supportTierLabel: String(options.supportTierLabel) } : {}),
    },
    contractProfile: READALONG_CONTRACT_PROFILE,
    evidence: normalizeEvidence(options.evidence),
    gaps: uniqueById(gapInputs.map(normalizeGap)),
    nonClaims: compactStrings(nonClaims).sort(),
    reportId: `${String(options.adapterId ?? sourceKind)}-${sourceKind}-contract-fit`,
    status: "lower_tier_with_gaps",
    supportedFeatures: compactStrings(supportedFeatureIds)
      .sort()
      .map((id) => ({ id, status: "supported" })),
    warnings: uniqueByCode(warningInputs.map(normalizeWarning)),
  };
}

function normalizeKind(value) {
  const kind = String(value ?? "")
    .trim()
    .toLowerCase();
  if (kind === "image" || kind === "scanned" || kind === "pdf-ocr") {
    return "ocr";
  }
  if (kind === "docx") {
    return "docx";
  }
  if (kind === "ocr") {
    return "ocr";
  }
  return "pdf";
}

function normalizeEvidence(evidence = {}) {
  return {
    fixtureIds: compactStrings(evidence.fixtureIds).sort(),
    sourceNames: compactStrings(evidence.sourceNames).sort(),
  };
}

function normalizeGap(gap) {
  return {
    contractExpectation: String(gap.contractExpectation ?? "readalong-sidecars"),
    id: String(gap.id ?? "contract_gap"),
    message: String(gap.message ?? "Lower-tier adapter contract gap."),
    severity: normalizeSeverity(gap.severity),
  };
}

function normalizeWarning(warning) {
  return {
    code: String(warning.code ?? warning.id ?? "contract_fit_warning"),
    message: String(warning.message ?? "Lower-tier adapter contract-fit warning."),
    severity: normalizeSeverity(warning.severity),
  };
}

function normalizeSeverity(value) {
  return ["info", "warning", "error"].includes(value) ? value : "warning";
}

function compactStrings(values = []) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function uniqueByCode(values) {
  return uniqueBy(values, "code").sort((left, right) => left.code.localeCompare(right.code));
}

function uniqueById(values) {
  return uniqueBy(values, "id").sort((left, right) => left.id.localeCompare(right.id));
}

function uniqueBy(values, key) {
  const byKey = new Map();
  for (const value of values) {
    if (!byKey.has(value[key])) {
      byKey.set(value[key], value);
    }
  }
  return [...byKey.values()];
}
