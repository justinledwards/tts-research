#!/usr/bin/env python3
"""Supertonic 3 synthesis bridge for Voice Studio.

The Go backend shells into this script so Supertonic can live in its own
virtualenv and model cache instead of sharing the Kokoro or pyannote runtimes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def has_expression_tags(text: str) -> bool:
    lowered = text.lower()
    return any(tag in lowered for tag in ("<laugh>", "<breath>", "<sigh>"))


def audio_duration_seconds(output_path: str, wav, duration_or_rate) -> float:
    try:
        import soundfile as sf

        return float(sf.info(output_path).duration)
    except Exception:
        pass

    try:
        numeric = float(duration_or_rate)
    except (TypeError, ValueError):
        return 0.0

    if numeric > 1000 and hasattr(wav, "__len__"):
        return float(len(wav)) / numeric

    return numeric


def load_tts(model_dir: str | None, auto_download: bool):
    try:
        from supertonic import TTS
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "supertonic Python package is not installed. "
            "Create .venv-supertonic and run `pip install supertonic`."
        ) from exc

    if model_dir:
        try:
            return TTS(auto_download=auto_download, model_dir=model_dir)
        except TypeError:
            return TTS(auto_download=auto_download, cache_dir=model_dir)

    return TTS(auto_download=auto_download)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text-file")
    parser.add_argument("--output")
    parser.add_argument("--voice-style", default="M1")
    parser.add_argument("--lang", default="en")
    parser.add_argument("--model-dir", default="")
    parser.add_argument("--auto-download", default="false")
    parser.add_argument("--diagnostics", action="store_true")
    args = parser.parse_args()

    if args.diagnostics:
        try:
            import supertonic  # noqa: F401
        except ModuleNotFoundError:
            print(json.dumps({"provider": "supertonic-3", "ready": False, "reason": "missing-package"}))
            return 0
        print(json.dumps({"provider": "supertonic-3", "ready": True}))
        return 0

    if not args.text_file or not args.output:
        raise SystemExit("--text-file and --output are required for synthesis")

    text = Path(args.text_file).read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit("text is required")

    tts = load_tts(args.model_dir or None, parse_bool(args.auto_download))
    style = tts.get_voice_style(voice_name=args.voice_style)
    wav, duration = tts.synthesize(text, voice_style=style, lang=args.lang)
    tts.save_audio(wav, args.output)
    duration_seconds = audio_duration_seconds(args.output, wav, duration)

    print(
        json.dumps(
            {
                "provider": "supertonic-3",
                "voice": args.voice_style,
                "language": args.lang,
                "durationMs": int(duration_seconds * 1000),
                "duration": duration_seconds,
                "modelDir": args.model_dir,
                "expressionTags": has_expression_tags(text),
            }
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
