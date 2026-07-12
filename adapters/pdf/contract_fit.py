"""Deterministic lower-tier adapter contract-fit report model."""

from __future__ import annotations

from typing import Any

CONTRACT_FIT_REPORT_SCHEMA_VERSION = "adapter-contract-fit-report.v1"
READALONG_CONTRACT_PROFILE = "readalong-sidecar-fit.v1"

BASE_WARNINGS = [
    {
        "code": "lower_tier_adapter",
        "message": (
            "This adapter is reported as a lower-tier contract-fit path; readable output may be useful "
            "but is not equivalent to the core HTML/EPUB/Markdown lanes."
        ),
        "severity": "warning",
    },
    {
        "code": "no_best_in_class_claim",
        "message": "This report does not claim best-in-class extraction quality for DOCX, PDF, or OCR sources.",
        "severity": "warning",
    },
    {
        "code": "exact_sync_not_claimed",
        "message": "Exact word sync is not claimed from this adapter report; sync fidelity must be gated separately.",
        "severity": "warning",
    },
]

BASE_NON_CLAIMS = [
    "best_in_class_docx_pdf_ocr",
    "durable_manifest_snapshot_runtime",
    "exact_word_sync_ready",
    "lossless_layout_or_semantics",
]

BASE_GAPS = [
    {
        "contractExpectation": "reading-unit-manifest.v1",
        "id": "manifest_sidecars_not_emitted",
        "message": (
            "The adapter output may be converted into manifest sidecars later, but this report does not emit "
            "durable ReadingUnitManifest or ReadalongManifest snapshots."
        ),
        "severity": "warning",
    },
    {
        "contractExpectation": "sync-fidelity-decision.v1",
        "id": "sync_fidelity_requires_later_evidence",
        "message": (
            "Highlight/sync fidelity requires a later SyncFidelityDecision with timing and mapping evidence; "
            "this report only records adapter contract fit."
        ),
        "severity": "warning",
    },
]

SOURCE_KIND_PRESETS: dict[str, dict[str, Any]] = {
    "pdf": {
        "gaps": [
            {
                "contractExpectation": "content-ir.v1 reading order",
                "id": "pdf_reading_order_degraded",
                "message": (
                    "PDF reading order, multi-column layout, tables, figures, and scholarly structure are "
                    "lower-tier heuristics unless later evidence promotes them."
                ),
                "severity": "warning",
            },
            {
                "contractExpectation": "locator-envelope.v1",
                "id": "pdf_locator_fidelity_varies_by_tier",
                "message": (
                    "PDF locator fidelity varies by tagged, born-digital, scanned, scholarly, or image/OCR "
                    "strategy and is not a core-adapter guarantee."
                ),
                "severity": "warning",
            },
        ],
        "nonClaims": ["best_in_class_pdf", "complete_pdf_layout_reconstruction", "semantic_pdf_tag_correctness"],
        "supportedFeatures": [
            "confidence_and_warning_metadata",
            "content_ir_v1_output",
            "pdf_or_ocr_locators",
            "support_tier_metadata",
        ],
        "warnings": [
            {
                "code": "pdf_lower_tier_contract_fit",
                "message": "PDF is represented as a lower-tier contract-fit adapter, not a best-in-class extraction lane.",
                "severity": "warning",
            }
        ],
    },
    "ocr": {
        "gaps": [
            {
                "contractExpectation": "locator-envelope.v1",
                "id": "ocr_text_confidence_degraded",
                "message": (
                    "OCR text and polygon evidence can be uncertain; downstream readiness and sync fidelity "
                    "must retain OCR confidence warnings."
                ),
                "severity": "warning",
            },
            {
                "contractExpectation": "content-ir.v1 reading order",
                "id": "ocr_reading_order_not_core",
                "message": "OCR reading order is lower-tier and may require manual or later layout evidence before narration claims.",
                "severity": "warning",
            },
        ],
        "nonClaims": ["best_in_class_ocr", "complete_ocr_accuracy", "exact_ocr_layout_reconstruction"],
        "supportedFeatures": [
            "content_ir_v1_output",
            "ocr_locators_with_confidence",
            "ocr_uncertainty_warnings",
            "source_only_readable_units_when_text_exists",
        ],
        "warnings": [
            {
                "code": "ocr_lower_tier_contract_fit",
                "message": "OCR is represented as a lower-tier contract-fit path with explicit uncertainty warnings.",
                "severity": "warning",
            }
        ],
    },
}


def create_lower_tier_contract_fit_report(
    *,
    adapter_id: str,
    adapter_version: str,
    source_kind: str,
    evidence: dict[str, Any] | None = None,
    extraction_path: str = "",
    support_tier_label: str = "",
    supported_feature_ids: list[str] | None = None,
    gaps: list[dict[str, Any]] | None = None,
    warnings: list[dict[str, Any]] | None = None,
    non_claims: list[str] | None = None,
) -> dict[str, Any]:
    """Build a stable machine-readable lower-tier contract-fit report."""

    normalized_kind = _normalize_kind(source_kind)
    preset = SOURCE_KIND_PRESETS.get(normalized_kind, SOURCE_KIND_PRESETS["pdf"])
    report_adapter = {
        "id": adapter_id,
        "sourceKind": normalized_kind,
        "supportTier": "lower-tier",
        "version": adapter_version,
    }
    if extraction_path:
        report_adapter["extractionPath"] = extraction_path
    if support_tier_label:
        report_adapter["supportTierLabel"] = support_tier_label
    return {
        "schemaVersion": CONTRACT_FIT_REPORT_SCHEMA_VERSION,
        "adapter": report_adapter,
        "contractProfile": READALONG_CONTRACT_PROFILE,
        "evidence": _normalize_evidence(evidence or {}),
        "gaps": _unique_by_id([_normalize_gap(item) for item in [*BASE_GAPS, *preset["gaps"], *(gaps or [])]]),
        "nonClaims": sorted(_compact_strings([*BASE_NON_CLAIMS, *preset["nonClaims"], *(non_claims or [])])),
        "reportId": f"{adapter_id}-{normalized_kind}-contract-fit",
        "status": "lower_tier_with_gaps",
        "supportedFeatures": [
            {"id": feature_id, "status": "supported"}
            for feature_id in sorted(_compact_strings([*preset["supportedFeatures"], *(supported_feature_ids or [])]))
        ],
        "warnings": _unique_by_code(
            [_normalize_warning(item) for item in [*BASE_WARNINGS, *preset["warnings"], *(warnings or [])]]
        ),
    }


def _normalize_kind(value: str) -> str:
    kind = str(value or "").strip().lower()
    if kind in {"image", "scanned", "pdf-ocr", "ocr"}:
        return "ocr"
    return "pdf"


def _normalize_evidence(evidence: dict[str, Any]) -> dict[str, list[str]]:
    return {
        "fixtureIds": sorted(_compact_strings(evidence.get("fixtureIds") or [])),
        "sourceNames": sorted(_compact_strings(evidence.get("sourceNames") or [])),
    }


def _normalize_gap(gap: dict[str, Any]) -> dict[str, str]:
    return {
        "contractExpectation": str(gap.get("contractExpectation") or "readalong-sidecars"),
        "id": str(gap.get("id") or "contract_gap"),
        "message": str(gap.get("message") or "Lower-tier adapter contract gap."),
        "severity": _normalize_severity(str(gap.get("severity") or "warning")),
    }


def _normalize_warning(warning: dict[str, Any]) -> dict[str, str]:
    return {
        "code": str(warning.get("code") or warning.get("id") or "contract_fit_warning"),
        "message": str(warning.get("message") or "Lower-tier adapter contract-fit warning."),
        "severity": _normalize_severity(str(warning.get("severity") or "warning")),
    }


def _normalize_severity(value: str) -> str:
    return value if value in {"error", "info", "warning"} else "warning"


def _compact_strings(values: list[Any]) -> list[str]:
    return list(dict.fromkeys(str(value).strip() for value in values if str(value).strip()))


def _unique_by_code(values: list[dict[str, str]]) -> list[dict[str, str]]:
    return _unique_by(values, "code")


def _unique_by_id(values: list[dict[str, str]]) -> list[dict[str, str]]:
    return _unique_by(values, "id")


def _unique_by(values: list[dict[str, str]], key: str) -> list[dict[str, str]]:
    by_key: dict[str, dict[str, str]] = {}
    for value in values:
        by_key.setdefault(value[key], value)
    return [by_key[item] for item in sorted(by_key)]
