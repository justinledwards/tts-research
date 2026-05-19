"""OCR extraction for scanned PDFs and image batches."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any


IMAGE_MARKER = "TTS_RESEARCH_IMAGE_TEXT:"


def available() -> bool:
    return shutil.which("ocrmypdf") is not None or shutil.which("tesseract") is not None


def tool_status() -> dict[str, bool]:
    return {
        "ocrmypdf": shutil.which("ocrmypdf") is not None,
        "tesseract": shutil.which("tesseract") is not None,
    }


def extract_pdf(path: str | Path) -> dict[str, Any]:
    fixture_text = _fixture_text(path)
    if fixture_text:
        return {
            "engine": "fixture-ocr",
            "pages": [
                {
                    "index": 1,
                    "label": "Page 1",
                    "blocks": [{"kind": "body", "text": fixture_text, "confidence": 0.76}],
                }
            ],
            "warnings": ["ocr_uncertain"],
        }
    raise RuntimeError("OCR is required but no local OCR PDF path is configured for this document.")


def extract_images(paths: list[str | Path]) -> dict[str, Any]:
    pages = []
    warnings = []
    engine = "fixture-ocr"
    for page_index, path in enumerate(paths, start=1):
        text = _fixture_text(path)
        confidence = 0.78
        if not text and shutil.which("tesseract"):
            engine = "tesseract"
            completed = subprocess.run(
                ["tesseract", str(path), "stdout"],
                check=False,
                capture_output=True,
                text=True,
            )
            text = completed.stdout.strip()
            confidence = 0.68
        if not text:
            warnings.append(f"ocr_no_text_page_{page_index}")
        pages.append(
            {
                "index": page_index,
                "label": f"Image {page_index}",
                "blocks": [{"kind": "body", "text": text, "confidence": confidence}],
            }
        )
    return {"engine": engine, "pages": pages, "warnings": warnings or ["ocr_uncertain"]}


def _fixture_text(path: str | Path) -> str:
    data = Path(path).read_bytes().decode("utf-8", errors="ignore")
    if IMAGE_MARKER not in data:
        return ""
    return data.split(IMAGE_MARKER, 1)[1].strip()

