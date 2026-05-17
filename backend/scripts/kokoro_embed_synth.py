#!/usr/bin/env python3
"""Render Kokoro audio from a kokoro.embed optimized style JSON."""

from __future__ import annotations

import argparse
import json
import os
import sys
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
    upstream_dir = args.upstream_dir.resolve()
    if not (upstream_dir / "optimize_style.py").exists():
        raise SystemExit(f"kokoro.embed optimize_style.py not found at {upstream_dir}")
    sys.path.insert(0, str(upstream_dir))

    from optimize_style import get_phonemes, kokoro_forward  # type: ignore

    device = resolve_device(args.device)
    if device == "mps":
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

    text = args.text_file.read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit("text file is empty")

    pipeline = KPipeline(lang_code=args.lang_code, repo_id=REPO_ID, device=device)
    model = pipeline.model
    for _, module in model.named_modules():
        if isinstance(module, (torch.nn.LSTM, torch.nn.GRU, torch.nn.RNN)):
            module.train()

    style = load_style(args.style_file).to(model.device)
    phonemes = get_phonemes(pipeline, text)
    if not phonemes:
        raise SystemExit("kokoro returned no phonemes")

    with torch.no_grad():
        audio = kokoro_forward(model, phonemes, style, args.speed)
    audio_np = audio.detach().cpu().numpy().astype(np.float32, copy=False)
    if audio_np.size == 0:
        raise SystemExit("kokoro embed returned no audio")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.output, audio_np, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    metadata = {
        "provider": "kokoro-embed",
        "repoId": REPO_ID,
        "voice": args.style_file.stem,
        "langCode": args.lang_code,
        "speed": args.speed,
        "sampleRate": SAMPLE_RATE,
        "sampleCount": int(audio_np.size),
        "durationMs": round(audio_np.size / SAMPLE_RATE * 1000),
    }
    print(json.dumps(metadata, ensure_ascii=False))


def load_style(path: Path) -> torch.Tensor:
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    style = torch.tensor(data["style"], dtype=torch.float32)
    if style.dim() == 1:
        style = style.unsqueeze(0)
    return style


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate WAV audio with Kokoro embed style.")
    parser.add_argument("--text-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--style-file", required=True, type=Path)
    parser.add_argument("--upstream-dir", default="../.upstreams/kokoro.embed", type=Path)
    parser.add_argument("--lang-code", default="a")
    parser.add_argument("--speed", default=1.0, type=float)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "mps", "cuda"])
    return parser.parse_args()


if __name__ == "__main__":
    main()
