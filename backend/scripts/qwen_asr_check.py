#!/usr/bin/env python3
"""Transcribe generated audio with Qwen3-ASR for checker validation."""

from __future__ import annotations

import argparse
from contextlib import redirect_stdout
import json
from pathlib import Path
import sys
from typing import Any

import torch
from qwen_asr import Qwen3ASRModel


def main() -> None:
    args = parse_args()
    model, device_map = load_model(args)
    if args.server:
        run_server(args, model, device_map)
        return

    if args.audio is None:
        raise SystemExit("--audio is required unless --server is set")

    metadata = transcribe(model, args.audio, args.model, normalize_language(args.language))
    print(json.dumps(metadata, ensure_ascii=False))


def read_attr(value: Any, name: str) -> str:
    if isinstance(value, dict):
        return str(value.get(name) or "")

    return str(getattr(value, name, "") or "")


def load_model(args: argparse.Namespace) -> tuple[Qwen3ASRModel, str]:
    device_map = resolve_device(args.device)
    dtype = torch.float32 if device_map == "cpu" else torch.bfloat16
    with redirect_stdout(sys.stderr):
        model = Qwen3ASRModel.from_pretrained(
            args.model,
            dtype=dtype,
            device_map=device_map,
            max_inference_batch_size=1,
            max_new_tokens=args.max_new_tokens,
        )

    return model, device_map


def transcribe(
    model: Qwen3ASRModel,
    audio: Path,
    model_name: str,
    language: str | None,
) -> dict[str, str]:
    with redirect_stdout(sys.stderr):
        results = model.transcribe(audio=str(audio), language=language)
    if not results:
        raise RuntimeError("Qwen ASR returned no results")

    first = results[0]
    return {
        "provider": "qwen-asr",
        "model": model_name,
        "language": read_attr(first, "language"),
        "transcript": read_attr(first, "text"),
    }


def run_server(args: argparse.Namespace, model: Qwen3ASRModel, device_map: str) -> None:
    ready = {
        "type": "ready",
        "provider": "qwen-asr",
        "model": args.model,
        "device": device_map,
    }
    print(json.dumps(ready, ensure_ascii=False), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            request_id = str(request.get("id") or "")
            audio = Path(str(request["audio"]))
            language = normalize_language(str(request.get("language") or args.language))
            response = transcribe(model, audio, args.model, language)
            response["id"] = request_id
        except Exception as error:  # noqa: BLE001 - worker returns structured errors to Go.
            response = {
                "id": str(locals().get("request_id", "")),
                "error": str(error),
            }

        print(json.dumps(response, ensure_ascii=False), flush=True)


def resolve_device(device: str) -> str:
    if device != "auto":
        return device
    if torch.cuda.is_available():
        return "cuda:0"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def normalize_language(language: str) -> str | None:
    value = language.strip()
    if not value:
        return None

    aliases = {
        "ar": "Arabic",
        "cn": "Chinese",
        "de": "German",
        "en": "English",
        "es": "Spanish",
        "fr": "French",
        "hi": "Hindi",
        "id": "Indonesian",
        "it": "Italian",
        "ja": "Japanese",
        "jp": "Japanese",
        "ko": "Korean",
        "ms": "Malay",
        "nl": "Dutch",
        "pt": "Portuguese",
        "ru": "Russian",
        "sv": "Swedish",
        "th": "Thai",
        "tr": "Turkish",
        "vi": "Vietnamese",
        "yue": "Cantonese",
        "zh": "Chinese",
    }

    return aliases.get(value.lower(), value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Qwen3-ASR over a WAV file.")
    parser.add_argument("--audio", type=Path)
    parser.add_argument("--model", default="Qwen/Qwen3-ASR-1.7B")
    parser.add_argument("--language", default="English")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--max-new-tokens", default=512, type=int)
    parser.add_argument("--server", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    main()
