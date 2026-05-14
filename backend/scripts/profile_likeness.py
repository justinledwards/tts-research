#!/usr/bin/env python3
"""Measure speaker likeness between a reference WAV and a generated WAV."""

from __future__ import annotations

import argparse
import json
import os
import sys


def fail(message: str, code: int = 2) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score voice clone likeness with pyannote embeddings")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--generated", required=True)
    parser.add_argument("--model", default="pyannote/embedding")
    return parser.parse_args()


def as_numpy_embedding(value):
    try:
        import numpy as np
    except ImportError as exc:  # pragma: no cover - dependency provided by pyannote stack
        fail(f"numpy is required for likeness scoring: {exc}", 3)

    if hasattr(value, "detach"):
        value = value.detach().cpu().numpy()
    return np.asarray(value, dtype="float64").reshape(-1)


def main() -> int:
    args = parse_args()
    try:
        import numpy as np
        from pyannote.audio import Inference, Model
    except ImportError as exc:
        fail(f"pyannote audio dependencies are not installed: {exc}", 3)

    token = os.environ.get("PYANNOTE_AUTH_TOKEN") or os.environ.get("HF_TOKEN") or None
    try:
        if token:
            model = Model.from_pretrained(args.model, token=token)
        else:
            model = Model.from_pretrained(args.model)
        inference = Inference(model, window="whole")
        reference_embedding = as_numpy_embedding(inference(args.reference))
        generated_embedding = as_numpy_embedding(inference(args.generated))
    except Exception as exc:  # noqa: BLE001
        fail(f"speaker embedding inference failed: {exc}", 4)

    denominator = float(np.linalg.norm(reference_embedding) * np.linalg.norm(generated_embedding))
    similarity = 0.0
    if denominator > 0:
        similarity = float(np.dot(reference_embedding, generated_embedding) / denominator)
    similarity = max(0.0, min(1.0, (similarity + 1.0) / 2.0))

    result = {
        "score": similarity,
        "speakerSimilarity": similarity,
        "embeddingModel": args.model,
        "reason": "cosine speaker embedding similarity",
    }
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
