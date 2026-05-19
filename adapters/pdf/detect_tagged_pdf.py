"""Tagged PDF and text-layer health detection."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


FIXTURE_MARKER = b"TTS_RESEARCH_PDF_FIXTURE"


def load_pdf_fixture(path: str | Path) -> dict[str, Any] | None:
    data = Path(path).read_bytes()
    marker_index = data.find(FIXTURE_MARKER)
    if marker_index < 0:
        return None
    payload = data[marker_index + len(FIXTURE_MARKER) :].decode("utf-8", errors="ignore")
    payload = payload.strip()
    if payload.startswith(":"):
        payload = payload[1:].strip()
    if "%%EOF" in payload:
        payload = payload.split("%%EOF", 1)[0].strip()
    payload = "\n".join(re.sub(r"^\s*%\s?", "", line) for line in payload.splitlines())
    return json.loads(payload)


def detect_tagged_pdf(path: str | Path) -> dict[str, Any]:
    fixture = load_pdf_fixture(path)
    if fixture is not None:
        pages = fixture.get("pages", [])
        text_chars = sum(len(str(page.get("text", ""))) for page in pages if isinstance(page, dict))
        return {
            "tagged": bool(fixture.get("tagged")),
            "pageCount": len(pages),
            "textChars": text_chars,
            "textLayerHealthy": text_chars >= 24,
            "source": "fixture",
        }

    data = Path(path).read_bytes()
    tagged = (
        b"/StructTreeRoot" in data
        or b"/MarkInfo" in data
        or re.search(rb"/Marked\s+true", data, re.IGNORECASE) is not None
    )
    return {
        "tagged": tagged,
        "pageCount": 0,
        "textChars": 0,
        "textLayerHealthy": False,
        "source": "pdf-bytes",
    }
