#!/usr/bin/env python3
"""Build optional voice-profile style artifacts from local research modules."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


MODULES = {
    "supertonic-embed": {
        "engine": "supertonic-3",
        "repo": "kdrkdrkdr/supertonic.embed",
        "default_steps": 3000,
        "threshold": 0.24,
    },
    "kokoro-embed": {
        "engine": "kokoro-embed",
        "repo": "kdrkdrkdr/kokoro.embed",
        "default_steps": 20000,
        "threshold": 0.20,
    },
}


def main() -> int:
    args = parse_args()
    module = MODULES.get(args.module_id)
    if module is None:
        raise SystemExit(f"unsupported module: {args.module_id}")

    reference = args.reference.resolve()
    upstream_dir = args.upstream_dir.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if os.environ.get("VOICE_EMBED_FAKE_ARTIFACT") == "1":
        result = write_fake_artifact(args, module, output_dir)
        print(json.dumps(result))
        return 0

    optimize_script = upstream_dir / "optimize_style.py"
    if not optimize_script.exists():
        raise SystemExit(f"{args.module_id} is not installed at {upstream_dir}")

    name = safe_name(f"tts_research_{args.profile_id}_{args.module_id}")
    upstream_wav = upstream_dir / "wavs" / f"{name}.wav"
    upstream_wav.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(reference, upstream_wav)

    steps = args.steps if args.steps > 0 else int(module["default_steps"])
    config = {
        "name": name,
        "target_wav": str(upstream_wav),
        "reference_style": args.base_style or "auto",
        "seed": args.seed,
        "lr": args.lr,
        "num_steps": steps,
        "save_every": max(10, min(args.save_every, steps)),
        "early_stop_loss_threshold": float(module["threshold"]),
    }
    if args.module_id == "supertonic-embed":
        config["total_step"] = args.total_step
        config["speed"] = args.speed or 1.05
    else:
        config["speed"] = args.speed or 1.0

    config_path = upstream_dir / "configs" / f"{name}.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    command = [sys.executable, str(optimize_script), str(config_path)]
    completed = subprocess.run(
        command,
        cwd=upstream_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(completed.stderr.strip() or completed.stdout.strip())

    final_path = upstream_dir / "logs" / name / f"{name}_final.json"
    if not final_path.exists():
        raise SystemExit(f"optimizer completed but did not produce {final_path}")

    artifact_file = f"{args.module_id}.json"
    artifact_path = output_dir / artifact_file
    shutil.copyfile(final_path, artifact_path)

    result = {
        "moduleId": args.module_id,
        "engineId": module["engine"],
        "kind": "style-json",
        "file": artifact_file,
        "path": str(artifact_path),
        "loss": parse_best_loss(completed.stdout),
        "steps": parse_steps(completed.stdout, steps),
        "baseStyle": args.base_style or "auto",
        "upstreamRef": args.upstream_ref,
        "modelVersion": f"{module['repo']}@{args.upstream_ref}",
        "metadata": {
            "config": str(config_path),
            "upstreamLog": str(final_path.parent),
        },
    }
    print(json.dumps(result))
    return 0


def write_fake_artifact(args: argparse.Namespace, module: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    artifact_file = f"{args.module_id}.json"
    artifact_path = output_dir / artifact_file
    if args.module_id == "supertonic-embed":
        payload: dict[str, Any] = {
            "style_ttl": {"data": [0.0] * (1 * 50 * 256), "dims": [1, 50, 256], "type": "float32"},
            "style_dp": {"data": [0.0] * (1 * 8 * 16), "dims": [1, 8, 16], "type": "float32"},
            "metadata": {"source_file": str(args.reference), "fake": True},
        }
    else:
        payload = {
            "style": [[0.0] * 256],
            "dims": [1, 256],
            "metadata": {"source_file": str(args.reference), "preset": "fake", "fake": True},
        }
    artifact_path.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    return {
        "moduleId": args.module_id,
        "engineId": module["engine"],
        "kind": "style-json",
        "file": artifact_file,
        "path": str(artifact_path),
        "loss": 0.0,
        "steps": 0,
        "baseStyle": args.base_style or "fake",
        "upstreamRef": args.upstream_ref,
        "modelVersion": f"{module['repo']}@{args.upstream_ref}",
        "metadata": {"fake": "true"},
    }


def parse_best_loss(output: str) -> float:
    matches = re.findall(r"Best loss:\s*([0-9.]+)", output)
    if not matches:
        return 0.0
    try:
        return float(matches[-1])
    except ValueError:
        return 0.0


def parse_steps(output: str, fallback: int) -> int:
    matches = re.findall(r"Step\s+(\d+)/", output)
    if not matches:
        return fallback
    try:
        return int(matches[-1])
    except ValueError:
        return fallback


def safe_name(value: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_.-]+", "_", value).strip("._")
    return clean or "voice_profile"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--module-id", required=True, choices=sorted(MODULES))
    parser.add_argument("--profile-id", required=True)
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--upstream-dir", required=True, type=Path)
    parser.add_argument("--upstream-ref", default="main")
    parser.add_argument("--base-style", default="auto")
    parser.add_argument("--steps", default=0, type=int)
    parser.add_argument("--seed", default=42, type=int)
    parser.add_argument("--lr", default=2e-4, type=float)
    parser.add_argument("--save-every", default=100, type=int)
    parser.add_argument("--total-step", default=5, type=int)
    parser.add_argument("--speed", default=0.0, type=float)
    return parser.parse_args()


if __name__ == "__main__":
    sys.exit(main())
