#!/usr/bin/env python3
"""Extract text-layer content from a PDF as JSON for Book Cinema."""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any


def outline_page(reader: Any, destination: Any) -> int | None:
    try:
        return int(reader.get_destination_page_number(destination)) + 1
    except Exception:
        return None


def flatten_outlines(reader: Any, items: list[Any]) -> list[dict[str, str | int]]:
    outlines: list[dict[str, str | int]] = []
    for item in items:
        if isinstance(item, list):
            outlines.extend(flatten_outlines(reader, item))
            continue
        title = str(getattr(item, "title", "") or "").strip()
        page = outline_page(reader, item)
        if title and page:
            outlines.append({"title": title, "page": page})
    return outlines


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", nargs="?")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    try:
        from pypdf import PdfReader
    except Exception as exc:  # pragma: no cover - exercised from Go process tests.
        print(f"pypdf is not installed: {exc}", file=sys.stderr)
        return 2

    if args.check:
        return 0

    if not args.pdf:
        print("missing PDF path", file=sys.stderr)
        return 2

    path = pathlib.Path(args.pdf)
    reader = PdfReader(str(path))
    pages: list[dict[str, str]] = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({"label": f"Page {index}", "text": text})

    title = ""
    author = ""
    metadata = reader.metadata
    if metadata and metadata.title:
        title = str(metadata.title).strip()
    if metadata and metadata.author:
        author = str(metadata.author).strip()
    if not title:
        title = path.stem

    outlines: list[dict[str, str | int]] = []
    try:
        outlines = flatten_outlines(reader, list(reader.outline))
    except Exception:
        outlines = []

    print(json.dumps({"title": title, "author": author, "pages": pages, "outlines": outlines}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
