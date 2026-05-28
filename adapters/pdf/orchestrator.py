"""Strategy-table orchestration for tiered PDF/image ingestion."""

from __future__ import annotations

import importlib.util
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from . import (
    detect_tagged_pdf,
    extract_tables_with_pdfplumber,
    extract_with_pymupdf,
    layout_with_layoutparser_or_doctr,
    ocr_with_ocrmypdf_or_tesseract,
    scholarly_with_grobid,
)


ADAPTER_VERSION = "pdf-adapter-v1"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


@dataclass(frozen=True)
class Strategy:
    tier: str
    label: str
    extractor_id: str
    predicate: Callable[[dict[str, Any]], bool]
    action: Callable[[dict[str, Any]], dict[str, Any]]


def emit_adapter(payload: dict[str, Any]) -> dict[str, Any]:
    paths = [str(item) for item in payload.get("sourcePaths") or []]
    if not paths and payload.get("sourcePath"):
        paths = [str(payload["sourcePath"])]
    if not paths:
        raise ValueError("sourcePath or sourcePaths is required for PDF adapter.")

    import_profile = str(payload.get("importProfile") or "auto")
    table_mode = str(payload.get("pdfTableMode") or "auto")
    source_name = str(payload.get("sourceName") or Path(paths[0]).name)
    source_id = str(payload.get("sourceId") or "pdf-source")
    source_type = str(payload.get("sourceType") or "bookSource")
    generated_at = payload.get("generatedAt")
    project_id = str(payload.get("projectId") or "")
    kind = "image" if len(paths) > 1 or Path(paths[0]).suffix.lower() in IMAGE_EXTENSIONS else "pdf"

    context = {
        "paths": paths,
        "kind": kind,
        "importProfile": import_profile,
        "pdfTableMode": table_mode,
        "sourceName": source_name,
        "sourceId": source_id,
    }
    strategy = next(item for item in strategies() if item.predicate(context))
    extracted = strategy.action(context)
    warnings = list(extracted.get("warnings", []))
    pages = extracted.get("pages", [])
    if table_mode != "off" and kind == "pdf" and strategy.tier != "E":
        tables = extract_tables_with_pdfplumber.extract_tables(paths[0])
        pages = _append_table_blocks(pages, tables, table_mode)
        if tables and table_mode == "auto":
            warnings.append("tables_detected")

    pages, layout_warnings = _apply_layout_order(pages)
    warnings.extend(layout_warnings)
    nodes, confidence = _nodes_from_pages(
        pages,
        source_id=source_id,
        source_format=kind,
        strategy=strategy,
        ocr_engine=str(extracted.get("engine", "")),
    )
    if not nodes:
        raise RuntimeError("No readable text was extracted from this source.")
    chain = _extractor_chain(strategy, confidence, warnings)
    metadata = {
        "title": extracted.get("title") or Path(source_name).stem,
        "author": extracted.get("author") or "",
        "supportTier": strategy.tier,
        "supportTierLabel": strategy.label,
        "confidence": confidence,
        "extractorChain": chain,
        "warnings": sorted(set(str(item) for item in warnings if str(item).strip())),
        "importProfile": import_profile,
        "pdfTableMode": table_mode,
        "capabilities": capabilities(),
    }
    document = {
        "schemaVersion": "content-ir.v1",
        "id": source_id,
        "sourceType": source_type,
        "sourceId": source_id,
        "projectId": project_id,
        "sourceName": source_name,
        "adapterVersion": ADAPTER_VERSION,
        "generatedAt": generated_at,
        "metadata": metadata,
        "nodes": nodes,
    }
    return {
        "adapterVersion": ADAPTER_VERSION,
        "author": metadata["author"],
        "capabilities": capabilities(),
        "diagnostics": diagnostics(),
        "document": document,
        "metadata": metadata,
        "title": metadata["title"],
        "warnings": metadata["warnings"],
    }


def strategies() -> list[Strategy]:
    return [
        Strategy("D", "Tier D: standalone images", "ocr", _is_image, _extract_images),
        Strategy("E", "Tier E: scholarly PDF", "grobid", _is_scholarly, _extract_scholarly),
        Strategy("A", "Tier A: tagged PDF", "pymupdf-tagged", _is_tagged_pdf, _extract_pdf_text),
        Strategy("B", "Tier B: born-digital PDF", "pymupdf", _has_text_layer, _extract_pdf_text),
        Strategy("C", "Tier C: scanned PDF", "ocr", lambda _: True, _extract_scanned_pdf),
    ]


def capabilities() -> dict[str, Any]:
    return {
        "adapterId": "pdf",
        "extensions": [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"],
        "mimeTypes": ["application/pdf", "image/png", "image/jpeg", "image/tiff", "image/webp"],
        "sourceKinds": ["file", "url", "bookSource"],
        "features": {
            "supportTiers": ["A", "B", "C", "D", "E"],
            "ocr": True,
            "tables": True,
            "figures": True,
            "bibliography": True,
            "confidence": True,
            "extractorChain": True,
        },
    }


def diagnostics() -> dict[str, Any]:
    ocr_tools = ocr_with_ocrmypdf_or_tesseract.tool_status()
    tools = {
        "pymupdf": _module_available("fitz"),
        "pdfplumber": _module_available("pdfplumber"),
        "ocrmypdf": ocr_tools["ocrmypdf"],
        "tesseract": ocr_tools["tesseract"],
        "grobid": scholarly_with_grobid.available(),
        "layoutparser": _module_available("layoutparser"),
        "doctr": _module_available("doctr"),
        "pdftotext": shutil.which("pdftotext") is not None,
    }
    available = tools["pymupdf"] or tools["pdftotext"] or tools["tesseract"] or tools["ocrmypdf"]
    return {
        "adapterId": "pdf",
        "available": available,
        "status": "available" if available else "missing",
        "warnings": [] if available else ["No PDF or OCR extractor is available."],
        "tools": {name: {"available": value, "status": "available" if value else "missing"} for name, value in tools.items()},
    }


def _is_image(context: dict[str, Any]) -> bool:
    return context["kind"] == "image"


def _is_scholarly(context: dict[str, Any]) -> bool:
    if context["importProfile"] != "scholarly":
        return False
    scholarly = scholarly_with_grobid.extract(context["paths"][0])
    context["scholarlyResult"] = scholarly
    if scholarly is None:
        context["scholarlyWarning"] = "scholarly_extractor_unavailable"
        return False
    return True


def _is_tagged_pdf(context: dict[str, Any]) -> bool:
    detection = detect_tagged_pdf.detect_tagged_pdf(context["paths"][0])
    context["detection"] = detection
    return bool(detection.get("tagged")) and bool(detection.get("textLayerHealthy"))


def _has_text_layer(context: dict[str, Any]) -> bool:
    detection = context.get("detection") or detect_tagged_pdf.detect_tagged_pdf(context["paths"][0])
    context["detection"] = detection
    if detection.get("textLayerHealthy"):
        return True
    try:
        result = extract_with_pymupdf.extract(context["paths"][0])
    except Exception:
        return False
    context["textResult"] = result
    return _page_text_chars(result.get("pages", [])) >= 24


def _extract_images(context: dict[str, Any]) -> dict[str, Any]:
    return ocr_with_ocrmypdf_or_tesseract.extract_images(context["paths"])


def _extract_scholarly(context: dict[str, Any]) -> dict[str, Any]:
    result = context.get("scholarlyResult") or scholarly_with_grobid.extract(context["paths"][0])
    if result is None:
        raise RuntimeError("Scholarly extraction was requested but GROBID returned no content.")
    result.setdefault("warnings", [])
    return result


def _extract_pdf_text(context: dict[str, Any]) -> dict[str, Any]:
    result = context.get("textResult") or extract_with_pymupdf.extract(context["paths"][0])
    if context.get("scholarlyWarning"):
        result.setdefault("warnings", []).append(context["scholarlyWarning"])
    return result


def _extract_scanned_pdf(context: dict[str, Any]) -> dict[str, Any]:
    try:
        return ocr_with_ocrmypdf_or_tesseract.extract_pdf(context["paths"][0])
    except RuntimeError:
        if not ocr_with_ocrmypdf_or_tesseract.available():
            raise RuntimeError(
                "This PDF appears to be scanned. Install Tesseract or OCRmyPDF to import it."
            )
        raise


def _append_table_blocks(pages: list[dict[str, Any]], tables: list[dict[str, Any]], table_mode: str) -> list[dict[str, Any]]:
    if table_mode == "off":
        return pages
    by_page: dict[int, list[dict[str, Any]]] = {}
    for table in tables:
        by_page.setdefault(int(table.get("pageIndex", 1)), []).append(table)
    for page in pages:
        page_tables = by_page.get(int(page.get("index", 1)), [])
        for table in page_tables:
            rows = table.get("rows", [])
            text = "\n".join(" | ".join(str(cell) for cell in row) for row in rows)
            page.setdefault("blocks", []).append(
                {
                    "kind": "table",
                    "text": text,
                    "confidence": float(table.get("confidence", 0.8)),
                    "metadata": {"rows": rows, "tableIndex": table.get("tableIndex")},
                }
            )
    return pages


def _apply_layout_order(pages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    for page in pages:
        blocks = page.get("blocks", [])
        ordered, page_warnings = layout_with_layoutparser_or_doctr.order_blocks(blocks)
        page["blocks"] = ordered
        warnings.extend(page_warnings)
    return pages, warnings


def _nodes_from_pages(
    pages: list[dict[str, Any]],
    *,
    source_id: str,
    source_format: str,
    strategy: Strategy,
    ocr_engine: str,
) -> tuple[list[dict[str, Any]], float]:
    nodes: list[dict[str, Any]] = []
    offset = 0
    confidences: list[float] = []
    for page in pages:
        page_index = max(0, int(page.get("index", len(nodes) + 1)) - 1)
        for block in page.get("blocks", []):
            text = _normalize_text(block.get("text", ""))
            if not text:
                continue
            if nodes:
                offset += 2
            confidence = _bounded_float(block.get("confidence", 0.82))
            confidences.append(confidence)
            kind = str(block.get("kind") or "body")
            start = offset
            end = start + len(text)
            offset = end
            locator = _locator(source_format, page_index, block, ocr_engine, confidence)
            warnings = []
            if confidence < 0.75:
                warnings.append("ocr_uncertain" if locator["type"] == "ocr" else "low_confidence_extraction")
            node = {
                "nodeId": f"{strategy.extractor_id}-{kind}-{len(nodes) + 1:04d}",
                "parentId": "",
                "orderKey": f"{len(nodes) + 1:08d}",
                "kind": kind,
                "role": str(block.get("role") or ("body" if kind == "body" else kind)),
                "displayText": text,
                "normalisedText": " ".join(text.split()),
                "speechText": text if kind not in {"bibliography", "citation"} else "",
                "lang": "und",
                "script": "Latn",
                "dir": "ltr",
                "provenance": {
                    "format": source_format,
                    "sourceId": source_id,
                    "locator": locator,
                    "offsets": {"start": start, "end": end},
                    "extraction": {
                        "extractor": strategy.extractor_id,
                        "extractorVersion": ADAPTER_VERSION,
                        "supportTier": strategy.tier,
                        "step": strategy.label,
                        "confidence": confidence,
                    },
                },
                "ui": {"progressionHint": "linear", "highlightUnitHint": "node"},
                "speech": {
                    "policyHint": _policy_hint(kind),
                    "speechPolicy": {
                        "profile": "Enterprise",
                        "mode": "speak",
                        "explanation": "Policy has not been evaluated yet.",
                    },
                },
                "warnings": sorted(set(warnings + [str(item) for item in block.get("warnings", [])])),
                "confidence": confidence,
                "rights": {"status": "unknown", "notes": ""},
                "metadata": {
                    **dict(block.get("metadata", {})),
                    "pageIndex": page_index + 1,
                    "supportTier": strategy.tier,
                    "extractor": strategy.extractor_id,
                },
                "adapterVersion": ADAPTER_VERSION,
            }
            nodes.append(node)
    confidence = sum(confidences) / len(confidences) if confidences else 0
    return nodes, round(confidence, 3)


def _policy_hint(kind: str) -> dict[str, Any]:
    if kind == "heading":
        return {"mode": "speak", "emphasis": "heading", "pauseBeforeMs": 420, "pauseAfterMs": 520}
    if kind == "subheading":
        return {
            "mode": "speak",
            "emphasis": "subheading",
            "pauseBeforeMs": 280,
            "pauseAfterMs": 360,
        }
    return {"mode": "speak", "emphasis": "", "pauseBeforeMs": 0, "pauseAfterMs": 0}


def _locator(source_format: str, page_index: int, block: dict[str, Any], ocr_engine: str, confidence: float) -> dict[str, Any]:
    polygon = block.get("polygon") if isinstance(block.get("polygon"), list) else []
    if source_format == "image" or ocr_engine:
        if not polygon:
            polygon = [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}]
        return {
            "type": "ocr",
            "ocr": {
                "pageIndex": page_index,
                "polygon": polygon,
                "ocrEngine": ocr_engine or "ocr",
                "ocrConfidence": confidence,
            },
        }
    locator = {"type": "pdf", "pdf": {"pageIndex": page_index, "readingOrderIndex": int(block.get("readingOrder", 0))}}
    if isinstance(block.get("bbox"), dict):
        locator["pdf"]["bbox"] = block["bbox"]
    if polygon:
        locator["pdf"]["polygon"] = polygon
    return locator


def _extractor_chain(strategy: Strategy, confidence: float, warnings: list[str]) -> list[dict[str, Any]]:
    return [
        {"id": "detect", "label": "Detect format and text-layer health", "status": "done", "confidence": 1},
        {
            "id": strategy.extractor_id,
            "label": strategy.label,
            "status": "done",
            "confidence": round(confidence, 3),
            "warnings": sorted(set(str(item) for item in warnings if str(item).strip())),
        },
    ]


def _page_text_chars(pages: list[dict[str, Any]]) -> int:
    total = 0
    for page in pages:
        for block in page.get("blocks", []):
            total += len(str(block.get("text", "")).strip())
    return total


def _normalize_text(value: Any) -> str:
    lines = [" ".join(line.split()) for line in str(value or "").replace("\r\n", "\n").splitlines()]
    return "\n".join(lines).strip()


def _bounded_float(value: Any) -> float:
    try:
        number = float(value)
    except Exception:
        number = 0.82
    return max(0, min(1, number))


def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
