#!/usr/bin/env python3
"""PDF adapter CLI."""

from __future__ import annotations

import json
from pathlib import Path
import sys

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from adapters.pdf.orchestrator import diagnostics, dumps, emit_adapter
else:
    from .orchestrator import diagnostics, dumps, emit_adapter


def main() -> int:
    if "--check" in sys.argv:
        status = diagnostics()
        return 0 if status.get("available") else 2
    payload = json.loads(sys.stdin.read() or "{}")
    result = emit_adapter(payload)
    print(dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
