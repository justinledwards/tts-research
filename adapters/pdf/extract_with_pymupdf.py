"""Geometry-rich born-digital PDF extraction."""

from __future__ import annotations

import shutil
import subprocess
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
            for block_index, block in enumerate(page.get_text("blocks")):
                x0, y0, x1, y1, text, *_ = block
                text = str(text).strip()
                if text:
                    blocks.append(
                        {
                            "kind": "body",
                            "text": text,
                            "bbox": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
                            "confidence": 0.9,
                            "readingOrder": block_index,
                        }
                    )
            pages.append({"index": page_index + 1, "label": f"Page {page_index + 1}", "blocks": blocks})
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
                "blocks": blocks,
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

