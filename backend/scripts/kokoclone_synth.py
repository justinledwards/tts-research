#!/usr/bin/env python3
"""Generate cloned WAV audio with KokoClone."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import soundfile as sf

REPO_ID = "PatnaikAshish/kokoclone"


def main() -> None:
    args = parse_args()
    text = args.text_file.read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit("text file is empty")

    repo_dir = args.repo_dir.expanduser().resolve()
    if not (repo_dir / "core" / "cloner.py").exists():
        raise SystemExit(
            f"KokoClone repo not found at {repo_dir}; run scripts/start.sh without SKIP_BOOTSTRAP or set KOKOCLONE_REPO_DIR"
        )

    reference_audio = args.reference_audio.expanduser().resolve()
    if not reference_audio.exists():
        raise SystemExit(f"reference audio not found: {reference_audio}")

    output_path = args.output.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    runtime_dir = args.runtime_dir.expanduser().resolve()
    runtime_dir.mkdir(parents=True, exist_ok=True)

    sys.path.insert(0, str(repo_dir))
    os.chdir(runtime_dir)

    from core.cloner import KokoClone  # pylint: disable=import-error,import-outside-toplevel

    cloner = KokoClone()
    cloner.generate(
        text=text,
        lang=args.lang,
        reference_audio=str(reference_audio),
        output_path=str(output_path),
    )

    info = sf.info(output_path)
    voice_name = args.voice_name.strip() or reference_audio.stem
    metadata = {
        "provider": "kokoclone",
        "repoId": REPO_ID,
        "voice": voice_name,
        "langCode": args.lang,
        "speed": 1,
        "sampleRate": info.samplerate,
        "sampleCount": info.frames,
        "durationMs": round(info.frames / info.samplerate * 1000),
    }
    print(json.dumps(metadata, ensure_ascii=False))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate WAV audio with KokoClone.")
    parser.add_argument("--text-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--reference-audio", required=True, type=Path)
    parser.add_argument("--lang", default="en")
    parser.add_argument("--repo-dir", default="./data/kokoclone/repo", type=Path)
    parser.add_argument("--runtime-dir", default="./data/kokoclone/runtime", type=Path)
    parser.add_argument("--voice-name", default="")
    return parser.parse_args()


if __name__ == "__main__":
    main()
