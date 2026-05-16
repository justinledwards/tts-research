"""Layout analysis hooks for PDF and OCR reading order."""

from __future__ import annotations

from typing import Any


def available() -> bool:
    try:
        import layoutparser  # noqa: F401

        return True
    except Exception:
        try:
            import doctr  # noqa: F401

            return True
        except Exception:
            return False


def order_blocks(blocks: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    if len(blocks) <= 1:
        return blocks, warnings
    with_boxes = [block for block in blocks if isinstance(block.get("bbox"), dict)]
    if len(with_boxes) != len(blocks):
        return blocks, warnings
    x_values = [float(block["bbox"].get("x", 0)) for block in blocks]
    if max(x_values) - min(x_values) > 120:
        warnings.append("reading_order_low_confidence")
    ordered = sorted(
        blocks,
        key=lambda block: (
            round(float(block["bbox"].get("y", 0)) / 24),
            float(block["bbox"].get("x", 0)),
        ),
    )
    return ordered, warnings

