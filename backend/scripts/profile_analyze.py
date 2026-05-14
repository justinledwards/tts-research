#!/usr/bin/env python3
"""Run local speaker diarization for Voice Profile source analysis.

The Go service owns scoring and reference construction. This script only reports
speaker turns from the configured pyannote pipeline as compact JSON.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze a normalized WAV for speaker turns")
    parser.add_argument("--audio", required=True, help="Path to normalized PCM WAV audio")
    parser.add_argument(
        "--model",
        default="pyannote/speaker-diarization-community-1",
        help="pyannote model or pipeline id",
    )
    parser.add_argument("--token", default="", help="Hugging Face or pyannote token")
    parser.add_argument("--strategy-version", default="speaker-aware-v1")
    return parser.parse_args()


def emit_error(message: str) -> None:
    print(message, file=sys.stderr)


def main() -> int:
    args = parse_args()
    token = args.token.strip() or os.environ.get("PYANNOTE_AUTH_TOKEN", "").strip()

    try:
        import torch
        from pyannote.audio import Pipeline
        from pyannote.audio.pipelines.utils.hook import ProgressHook
    except Exception as exc:  # pragma: no cover - exercised by local runtime setup.
        emit_error(f"pyannote audio dependencies are not installed: {exc}")
        return 3

    try:
        if token:
            pipeline = Pipeline.from_pretrained(args.model, token=token)
        else:
            pipeline = Pipeline.from_pretrained(args.model)
        if torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
        with ProgressHook(hidden=True) as hook:
            output = pipeline(args.audio, hook=hook)
    except Exception as exc:  # pragma: no cover - depends on model/runtime.
        emit_error(f"pyannote diarization failed: {exc}")
        return 4

    spans: list[dict[str, Any]] = []
    diarization = getattr(output, "speaker_diarization", output)
    for turn, speaker in diarization:
        start_ms = max(0, round(float(turn.start) * 1000))
        end_ms = max(start_ms, round(float(turn.end) * 1000))
        confidence = getattr(turn, "confidence", None)
        spans.append(
            {
                "speakerId": str(speaker),
                "startMs": start_ms,
                "endMs": end_ms,
                "confidence": float(confidence) if confidence is not None else 0.85,
            }
        )

    print(
        json.dumps(
            {
                "modelVersion": args.model,
                "strategyVersion": args.strategy_version,
                "spans": spans,
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
