"""Geometry-rich born-digital PDF extraction."""

from __future__ import annotations

import shutil
import subprocess
from statistics import median
from pathlib import Path
from typing import Any

from .detect_tagged_pdf import load_pdf_fixture


def available() -> bool:
    try:
        import fitz  # noqa: F401

        return True
    except Exception:
        return shutil.which("pdftotext") is not None


def extract(path: str | Path) -> dict[str, Any]:
    fixture = load_pdf_fixture(path)
    if fixture is not None:
        return _from_fixture(fixture)

    try:
        import fitz

        document = fitz.open(str(path))
        pages: list[dict[str, Any]] = []
        for page_index, page in enumerate(document):
            blocks = []
            for block_index, block in enumerate(page.get_text("dict").get("blocks", [])):
                text_block = _text_block_from_pymupdf(block, block_index)
                if text_block is not None:
                    blocks.append(text_block)
            pages.append(
                {
                    "index": page_index + 1,
                    "label": f"Page {page_index + 1}",
                    "blocks": _classify_pdf_text_headings(blocks),
                }
            )
        return {"title": Path(path).stem, "author": "", "pages": pages, "warnings": []}
    except Exception:
        return _extract_with_pdftotext(path)


def _from_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    pages = []
    for page_index, page in enumerate(fixture.get("pages", []), start=1):
        if not isinstance(page, dict):
            continue
        blocks = page.get("blocks")
        if not isinstance(blocks, list):
            blocks = [
                {
                    "kind": "body",
                    "text": str(page.get("text", "")),
                    "confidence": float(page.get("confidence", 0.9)),
                    "readingOrder": 0,
                }
            ]
        pages.append(
            {
                "index": int(page.get("index", page_index)),
                "label": str(page.get("label", f"Page {page_index}")),
                "blocks": _classify_pdf_text_headings(blocks),
            }
        )
    return {
        "title": str(fixture.get("title", "")),
        "author": str(fixture.get("author", "")),
        "pages": pages,
        "warnings": [str(item) for item in fixture.get("warnings", [])],
    }


def _extract_with_pdftotext(path: str | Path) -> dict[str, Any]:
    command = ["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"]
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    raw_pages = completed.stdout.replace("\r\n", "\n").split("\f")
    pages = []
    for page_index, raw_text in enumerate(raw_pages, start=1):
        text = "\n".join(" ".join(line.split()) for line in raw_text.splitlines()).strip()
        if not text:
            continue
        pages.append(
            {
                "index": page_index,
                "label": f"Page {page_index}",
                "blocks": [{"kind": "body", "text": text, "confidence": 0.84, "readingOrder": 0}],
            }
        )
    return {"title": Path(path).stem, "author": "", "pages": pages, "warnings": []}


def _text_block_from_pymupdf(block: dict[str, Any], reading_order: int) -> dict[str, Any] | None:
    if block.get("type") not in (0, None):
        return None
    lines = block.get("lines")
    if not isinstance(lines, list):
        return None
    line_texts: list[str] = []
    font_sizes: list[float] = []
    bold_spans = 0
    span_count = 0
    for line in lines:
        spans = line.get("spans") if isinstance(line, dict) else None
        if not isinstance(spans, list):
            continue
        text_parts: list[str] = []
        for span in spans:
            if not isinstance(span, dict):
                continue
            text = str(span.get("text", ""))
            if not text:
                continue
            text_parts.append(text)
            size = _bounded_float(span.get("size"), 0)
            if size > 0:
                font_sizes.append(size)
            span_count += 1
            font_name = str(span.get("font", "")).lower()
            flags = int(span.get("flags", 0) or 0)
            if "bold" in font_name or flags & 16:
                bold_spans += 1
        line_text = "".join(text_parts).strip()
        if line_text:
            line_texts.append(line_text)
    text = "\n".join(line_texts).strip()
    if not text:
        return None
    x0, y0, x1, y1 = block.get("bbox", (0, 0, 0, 0))
    font_size = median(font_sizes) if font_sizes else 0
    return {
        "kind": "body",
        "text": text,
        "bbox": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
        "confidence": 0.9,
        "fontSize": round(float(font_size), 3),
        "fontBold": span_count > 0 and bold_spans / span_count >= 0.5,
        "readingOrder": reading_order,
    }


def _classify_pdf_text_headings(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    font_sizes = [_bounded_float(block.get("fontSize"), 0) for block in blocks]
    font_sizes = [size for size in font_sizes if size > 0]
    if not font_sizes:
        return blocks
    body_size = median(font_sizes)
    classified: list[dict[str, Any]] = []
    heading_seen = False
    for index, block in enumerate(blocks):
        next_block = dict(block)
        if _is_obvious_pdf_heading(block, index, body_size):
            next_block["kind"] = "subheading" if heading_seen else "heading"
            next_block["role"] = next_block["kind"]
            heading_seen = True
        classified.append(next_block)
    return classified


def _is_obvious_pdf_heading(block: dict[str, Any], index: int, body_size: float) -> bool:
    if str(block.get("kind") or "body") != "body" or index > 5:
        return False
    text = str(block.get("text") or "").strip()
    if not text or _has_terminal_prose_punctuation(text):
        return False
    word_count = len(text.split())
    if word_count == 0 or word_count > 12:
        return False
    font_size = _bounded_float(block.get("fontSize"), 0)
    if font_size <= 0 or body_size <= 0:
        return False
    bold = bool(block.get("fontBold"))
    return font_size >= body_size * 1.22 or (bold and font_size >= body_size * 1.08)


def _has_terminal_prose_punctuation(text: str) -> bool:
    return text.rstrip().endswith((".", "!", "?", ";", ":"))


def _bounded_float(value: Any, default: float = 0.82) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed == parsed else default
