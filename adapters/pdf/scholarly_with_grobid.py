"""Scholarly PDF extraction via GROBID-style metadata."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from .detect_tagged_pdf import load_pdf_fixture


def available() -> bool:
    return bool(os.environ.get("GROBID_URL")) or shutil.which("grobid") is not None


def extract(path: str | Path) -> dict[str, Any] | None:
    fixture = load_pdf_fixture(path)
    if fixture is not None and isinstance(fixture.get("scholarly"), dict):
        scholarly = dict(fixture["scholarly"])
        scholarly.setdefault("title", fixture.get("title", ""))
        scholarly.setdefault("author", fixture.get("author", ""))
        return scholarly

    sidecar = Path(f"{path}.tei.xml")
    if sidecar.exists():
        return _extract_tei(sidecar.read_text(encoding="utf-8"))
    return None


def _extract_tei(tei: str) -> dict[str, Any]:
    root = ElementTree.fromstring(tei)
    ns = {"tei": "http://www.tei-c.org/ns/1.0"}

    def texts(query: str) -> list[str]:
        return [" ".join(node.itertext()).strip() for node in root.findall(query, ns)]

    blocks = []
    for kind, query in [
        ("body", ".//tei:text//tei:p"),
        ("figure", ".//tei:figure//tei:figDesc"),
        ("table", ".//tei:table"),
        ("bibliography", ".//tei:listBibl//tei:biblStruct"),
    ]:
        for text in texts(query):
            if text:
                blocks.append({"kind": kind, "text": text, "confidence": 0.84})
    return {
        "title": (texts(".//tei:titleStmt/tei:title") or [""])[0],
        "author": (texts(".//tei:titleStmt/tei:author") or [""])[0],
        "pages": [{"index": 1, "label": "Scholarly", "blocks": blocks}],
        "warnings": [],
    }

