"""PDF table extraction."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .detect_tagged_pdf import load_pdf_fixture


def available() -> bool:
    try:
        import pdfplumber  # noqa: F401

        return True
    except Exception:
        return False


def extract_tables(path: str | Path) -> list[dict[str, Any]]:
    fixture = load_pdf_fixture(path)
    if fixture is not None:
        tables = fixture.get("tables", [])
        return tables if isinstance(tables, list) else []

    try:
        import pdfplumber
    except Exception:
        return []

    tables: list[dict[str, Any]] = []
    with pdfplumber.open(str(path)) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            for table_index, rows in enumerate(page.extract_tables() or [], start=1):
                clean_rows = [[str(cell or "").strip() for cell in row] for row in rows if row]
                if clean_rows:
                    tables.append(
                        {
                            "pageIndex": page_index,
                            "tableIndex": table_index,
                            "rows": clean_rows,
                            "confidence": 0.82,
                        }
                    )
    return tables

