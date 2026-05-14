#!/usr/bin/env python3
"""Generate WAV audio with hexgrad/Kokoro-82M."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

SAMPLE_RATE = 24_000
REPO_ID = "hexgrad/Kokoro-82M"


def resolve_device(device: str) -> str:
    if device != "auto":
        return device
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def main() -> None:
    args = parse_args()
    device = resolve_device(args.device)
    text = args.text_file.read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit("text file is empty")

    if device == "mps":
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

    pipeline = KPipeline(lang_code=args.lang_code, repo_id=REPO_ID, device=device)
    generator = pipeline(text, voice=args.voice, speed=args.speed, split_pattern=args.split_pattern)

    audio_chunks: list[np.ndarray] = []
    segments: list[dict[str, Any]] = []

    for index, result in enumerate(generator):
        if result.audio is None:
            continue

        audio = result.audio.detach().cpu().numpy().astype(np.float32, copy=False)
        if audio.size == 0:
            continue

        audio_chunks.append(audio)
        segments.append(
            {
                "index": index,
                "graphemes": result.graphemes,
                "phonemes": result.phonemes,
                "sampleCount": int(audio.size),
            }
        )

    if not audio_chunks:
        raise SystemExit("kokoro returned no audio")

    output_audio = np.concatenate(audio_chunks)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.output, output_audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")

    metadata = {
        "provider": "kokoro",
        "repoId": REPO_ID,
        "voice": args.voice,
        "langCode": args.lang_code,
        "speed": args.speed,
        "sampleRate": SAMPLE_RATE,
        "sampleCount": int(output_audio.size),
        "durationMs": round(output_audio.size / SAMPLE_RATE * 1000),
        "segments": segments,
    }
    print(json.dumps(metadata, ensure_ascii=False))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate WAV audio with Kokoro.")
    parser.add_argument("--text-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--lang-code", default="a")
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--speed", default=1.0, type=float)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "mps", "cuda"])
    parser.add_argument("--split-pattern", default=r"\n+")
    return parser.parse_args()


if __name__ == "__main__":
    main()
