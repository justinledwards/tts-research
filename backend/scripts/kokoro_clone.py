#!/usr/bin/env python3
"""Generate cloned voice WAV output using KokoClone with a reference recording."""

from __future__ import annotations

import argparse
import contextlib
import os
import shutil
import json
import subprocess
import tempfile
import wave
import time
import sys
from pathlib import Path
from typing import Optional

KOKOCLONE_REPO_URL = "https://github.com/Ashish-Patnaik/kokoclone.git"
torch: Optional[object] = None


def _load_torch():
    global torch
    if torch is not None:
        return torch

    try:
        import importlib

        torch = importlib.import_module("torch")
        return torch
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing required module 'torch'. Run `python kokoro_clone.py --ensure-dependencies` first to install KokoClone dependencies."
        ) from exc


def _has_core_package(path: Path) -> bool:
    return (
        (path / "core" / "__init__.py").is_file()
        or (path / "core" / "cloner.py").is_file()
        or (path / "__init__.py").is_file()
        or (path / "cloner.py").is_file()
    )


def _core_import_path(path: Path) -> Path | None:
    if (path / "core" / "__init__.py").is_file() or (path / "core" / "cloner.py").is_file():
        return path
    if (path / "__init__.py").is_file() and (path / "cloner.py").is_file():
        return path.parent
    return None


def _has_reference_dependency(module_name: str) -> bool:
    try:
        __import__(module_name)
    except ModuleNotFoundError:
        return False
    return True


def _env_module_paths() -> list[Path]:
    env_values = [
        os.getenv("KOKORO_REFERENCE_MODULE_PATH", ""),
        os.getenv("KOKOCLONE_MODULE_PATH", ""),
        os.getenv("KOKOCLONE_REPO_PATH", ""),
        os.getenv("KOKOCLONE_PATH", ""),
    ]
    return [Path(value).expanduser() for value in env_values if value]


def _installation_marker(root: Path) -> Path:
    return root / ".tts-research-kokoclone-deps.installed"


def _is_stale_lock(lock_dir: Path, stale_after_seconds: float) -> bool:
    try:
        age_seconds = time.time() - lock_dir.stat().st_mtime
    except OSError:
        return False
    return age_seconds > stale_after_seconds


def _dependencies_ready(root: Path) -> bool:
    required_modules = (
        "kanade_tokenizer",
        "kokoro_onnx",
        "huggingface_hub",
        "misaki",
        "torch",
        "soundfile",
    )

    for module_name in required_modules:
        if not _has_reference_dependency(module_name):
            return False

    if not (root / "requirements.txt").is_file():
        # Best-effort marker support for custom clones with external dependency wiring.
        return True

    return True


def _pip_invocation() -> tuple[list[str], bool] | None:
    pip_check = subprocess.run(
        [sys.executable, "-m", "pip", "--version"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    if pip_check.returncode == 0:
        return ([sys.executable, "-m", "pip"], False)

    uv_path = shutil.which("uv")
    if uv_path is None:
        return None

    return ([uv_path, "pip", "install"], True)


def _install_reference_dependencies(root: Path) -> bool:
    requirements_path = root / "requirements.txt"
    if not requirements_path.is_file():
        return True

    if _dependencies_ready(root):
        return True

    lock_dir = root / ".koko-clone-deps-lock"
    if lock_dir.exists() and _is_stale_lock(lock_dir, 120):
        print("Removing stale dependency-install lock and retrying.", flush=True)
        shutil.rmtree(lock_dir, ignore_errors=True)

    started_waiting = time.monotonic()
    while True:
        try:
            lock_dir.mkdir()
            break
        except FileExistsError:
            if _is_stale_lock(lock_dir, 120):
                print("Removing stale dependency-install lock and retrying.", flush=True)
                shutil.rmtree(lock_dir, ignore_errors=True)
                continue
            if _dependencies_ready(root):
                return True
            if time.monotonic() - started_waiting > 120:
                return False
            time.sleep(0.25)

    installed = False
    try:
        pip_invocation = _pip_invocation()
        if pip_invocation is None:
            print("Unable to run pip installer: `pip` module not found and `uv` is unavailable.")
            return False

        pip_invocation_args, requires_python_option = pip_invocation
        install_command = [*pip_invocation_args]
        if requires_python_option:
            install_command.extend(["--python", str(sys.executable)])

        install_command.extend(["-r", str(requirements_path)])

        install = subprocess.run(
            install_command,
            cwd=str(root),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            check=False,
        )
        installed = install.returncode == 0
        if not installed:
            print(install.stdout)
    finally:
        try:
            if lock_dir.exists():
                lock_dir.rmdir()
        except OSError:
            pass

    if installed:
        try:
            _installation_marker(root).write_text("installed\n", encoding="utf-8")
        except OSError:
            pass
        return True
    return False


def _named_checkout_roots(anchor: Path, names: tuple[str, ...]) -> list[Path]:
    return [anchor / name for name in names]


def _bootstrap_root() -> Path:
    return Path(__file__).resolve().parent.parent / ".koko-clone"


def _ensure_bootstrap_clone(root: Path) -> Path | None:
    if root is None:
        return None
    if _has_core_package(root) or _has_core_package(root / "src"):
        return root

    if root.exists() and (not root.is_dir() or any(root.iterdir())):
        return None

    root.parent.mkdir(parents=True, exist_ok=True)
    if not shutil.which("git"):
        return None

    lock_dir = root.parent / ".koko-clone-bootstrap-lock"
    started_waiting = time.monotonic()
    while True:
        try:
            lock_dir.mkdir()
            break
        except FileExistsError:
            if _has_core_package(root) or _has_core_package(root / "src"):
                return root
            if time.monotonic() - started_waiting > 180:
                return None
            time.sleep(0.25)

    cmd = ["git", "clone", "--depth", "1", KOKOCLONE_REPO_URL, str(root)]
    cloned = False
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(root.parent),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            check=False,
        )
        cloned = completed.returncode == 0
    except FileNotFoundError:
        cloned = False
    finally:
        try:
            shutil.rmtree(lock_dir, ignore_errors=True)
        except OSError:
            pass

    if not cloned:
        return None

    if _has_core_package(root) or _has_core_package(root / "src"):
        return root

    if root.exists():
        shutil.rmtree(root, ignore_errors=True)
    return None


def _bootstrap_if_needed(candidate_roots: list[Path], bootstrap_path: Path) -> list[Path]:
    bootstrap_candidates: list[Path] = []
    if bootstrap_path not in candidate_roots:
        bootstrap_candidates.append(bootstrap_path)
        if (bootstrap_path / "src").is_dir():
            bootstrap_candidates.append(bootstrap_path / "src")

    return candidate_roots + bootstrap_candidates


def _candidate_roots(module_path: Optional[str] = None) -> list[Path]:
    roots: list[Path] = []
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent
    cwd = Path.cwd()
    bootstrap_root = _bootstrap_root()
    clone_names = (
        "koko-clone",
        "koko_clone",
        "kokoclone",
        ".koko-clone",
    )

    if module_path:
        roots.append(Path(module_path).expanduser())
    roots.extend(_env_module_paths())

    roots.extend([
        script_dir,
        script_dir.parent,
        cwd,
        cwd.parent,
        cwd / ".koko-clone",
        project_root,
        project_root.parent,
        project_root / ".koko-clone",
        *_named_checkout_roots(project_root, clone_names),
        *_named_checkout_roots(project_root.parent, clone_names),
        *_named_checkout_roots(project_root.parent.parent, clone_names),
    ])
    roots.extend(_bootstrap_if_needed([*roots], bootstrap_root))

    unique_roots: list[Path] = []
    seen: set[Path] = set()
    for root in roots:
        root = root.expanduser().resolve()
        if not root.is_dir():
            continue
        for candidate in (root, root / "src"):
            if candidate in seen:
                continue
            seen.add(candidate)
            unique_roots.append(candidate)

    return unique_roots


def configure_module_path(module_path: str | None = None) -> Path:
    bootstrap_path = _bootstrap_root()
    for root in _candidate_roots(module_path):
        import_path = _core_import_path(root)
        if import_path and _has_core_package(import_path):
            sys.path.insert(0, str(import_path))
            return import_path

    bootstrap_import_path = _ensure_bootstrap_clone(bootstrap_path)
    if bootstrap_import_path:
        import_path = _core_import_path(bootstrap_import_path)
        if import_path and _has_core_package(import_path):
            sys.path.insert(0, str(import_path))
            return import_path

    resolved_home = Path("~").expanduser()
    if resolved_home.is_dir():
        for sibling in (resolved_home / "git", resolved_home / "workspace", resolved_home):
            for name in ("koko-clone", "koko_clone", "kokoclone"):
                candidate = sibling / name
                import_path = _core_import_path(candidate)
                if import_path and _has_core_package(import_path):
                    sys.path.insert(0, str(import_path))
                    return import_path

    raise SystemExit(
            "unable to locate the koko-clone source containing core/cloner.py. "
            "TTS Research now attempts automatic bootstrap from "
            f"{KOKOCLONE_REPO_URL} into {str(_bootstrap_root())}. "
            "If automatic bootstrap is blocked (no git/network), set --module-path "
            "(or env KOKORO_REFERENCE_MODULE_PATH/KOKOCLONE_MODULE_PATH) to the repository root."
        )


def _read_output_metadata(output_path: Path) -> dict[str, int]:
    with wave.open(str(output_path), "rb") as source:
        sample_count = source.getnframes() * source.getnchannels()
        sample_rate = source.getframerate()
        duration_ms = round(float(source.getnframes()) / float(max(sample_rate, 1)) * 1000)

    return {
        "sampleRate": sample_rate,
        "sampleCount": int(sample_count),
        "durationMs": int(duration_ms),
    }


def _run_cloning(
    cloner,
    text: str,
    lang_code: str,
    reference_path: Path,
    output_path: Path,
) -> dict[str, int]:
    reference_audio = str(reference_path)
    if not reference_path.exists():
        raise SystemExit(f"reference audio not found: {reference_audio}")
    if not text:
        raise SystemExit("text is empty")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.redirect_stdout(sys.stderr):
        cloner.generate(
            text=text,
            lang=lang_code,
            reference_audio=reference_audio,
            output_path=str(output_path),
        )

    metadata = _read_output_metadata(output_path)
    metadata.update(
        {
            "provider": "kokoro-clone",
            "repoId": "koko-clone",
            "voice": "clone",
            "langCode": str(lang_code),
        },
    )
    return metadata


def _apply_clone_device(cloner: object, device: str) -> None:
    torch_module = _load_torch()
    selected_device = torch_module.device(device)
    cloner.device = selected_device

    for cache_key, kokoro_obj in getattr(cloner, "kokoro_cache", {}).items():
        if hasattr(kokoro_obj, "to"):
            cloner.kokoro_cache[cache_key] = kokoro_obj.to(selected_device)

    for component in ("kanade", "vocoder"):
        if not hasattr(cloner, component):
            continue
        value = getattr(cloner, component)
        if hasattr(value, "to"):
            setattr(cloner, component, value.to(selected_device))


def _new_output_path(directory: str) -> Path:
    output = tempfile.NamedTemporaryFile(prefix="kokoro-clone-", suffix=".wav", dir=directory)
    output.close()
    return Path(output.name)


def _run_server(cloner) -> None:
    print(json.dumps({"type": "ready", "provider": "kokoro-clone"}), flush=True)

    for line in sys.stdin:
        if not line.strip():
            continue

        try:
            request = json.loads(line)
            request_id = str(request.get("id") or "")
            text = str(request.get("text", "")).strip()
            lang_code = str(request.get("lang", "a")).strip()
            reference_path = str(request.get("ref", "")).strip()
            output_override = str(request.get("output", "")).strip()
            if not text:
                raise SystemExit("text is empty")
            if not reference_path:
                raise SystemExit("ref is required")

            if output_override:
                output_path = Path(output_override)
            else:
                output_path = _new_output_path(".")

            metadata = _run_cloning(
                cloner=cloner,
                text=text,
                lang_code=lang_code,
                reference_path=Path(reference_path),
                output_path=output_path,
            )
            metadata["id"] = request_id
            metadata["output"] = str(output_path)
            print(json.dumps(metadata, ensure_ascii=False), flush=True)
        except Exception as error:  # noqa: BLE001
            print(
                json.dumps(
                    {"id": str(locals().get("request_id", "")), "error": str(error)},
                    ensure_ascii=False,
                ),
                flush=True,
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate WAV audio with a cloned voice.")
    parser.add_argument("--text-file", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--lang", default="a")
    parser.add_argument("--ref", type=Path)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--server", action="store_true")
    parser.add_argument("--ensure-dependencies", action="store_true", help="Ensure clone dependencies are installed.")
    parser.add_argument("--module-path", default="")
    return parser.parse_args()


def _resolve_device(device: str) -> str:
    torch_module = _load_torch()
    if device != "auto":
        return device

    if torch_module.cuda.is_available():
        return "cuda"

    if torch_module.backends.mps.is_available():
        return "mps"

    return "cpu"


def main() -> None:
    args = parse_args()
    module_path = configure_module_path(args.module_path)
    if module_path is None:
        raise SystemExit(
            "unable to locate the koko-clone source containing core/cloner.py. "
            "Set --module-path or env KOKORO_REFERENCE_MODULE_PATH/KOKOCLONE_MODULE_PATH to a known clone root."
        )

    if args.ensure_dependencies:
        if not _dependencies_ready(module_path):
            if not _install_reference_dependencies(module_path):
                raise SystemExit(
                    "unable to install clone dependencies with `requirements.txt`. "
                    "Set --module-path (or env KOKORO_REFERENCE_MODULE_PATH / KOKOCLONE_MODULE_PATH) "
                    "to a known clone root."
                )
            module_path = configure_module_path(args.module_path)
            if not _dependencies_ready(module_path):
                raise SystemExit(
                    "reference dependencies were installed but still missing. "
                    "Please verify your environment and retry."
                )
        return

    try:
        from core.cloner import KokoClone
    except ModuleNotFoundError as exc:
        import_error: ModuleNotFoundError = exc
        if module_path is not None and not _dependencies_ready(module_path):
            if not _install_reference_dependencies(module_path):
                raise SystemExit(
                    "unable to import core.cloner because required clone dependencies are missing or could "
                    "not be installed automatically. Install the local checkout's requirements.txt and retry."
                ) from import_error
            try:
                from core.cloner import KokoClone
            except ModuleNotFoundError as retry_exc:
                import_error = retry_exc

        raise SystemExit(
            f"unable to import core.cloner (missing dependency: {import_error.name}). "
            "Install the checkout dependencies with `requirements.txt`, or set --module-path "
            "(or env KOKORO_REFERENCE_MODULE_PATH / KOKOCLONE_MODULE_PATH) to a known clone root."
        ) from import_error

    runtime_device = _resolve_device(args.device)
    if args.server:
        with contextlib.redirect_stdout(sys.stderr):
            cloner = KokoClone()
            _apply_clone_device(cloner, runtime_device)
        _run_server(cloner)
        return

    if args.text_file is None or args.output is None or args.ref is None:
        raise SystemExit("text mode requires --text-file, --output, and --ref")

    text = args.text_file.read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit("text file is empty")
    if not args.ref.exists():
        raise SystemExit(f"reference audio not found: {args.ref}")

    cloner = KokoClone()
    _apply_clone_device(cloner, runtime_device)
    metadata = _run_cloning(
        cloner=cloner,
        text=text,
        lang_code=str(args.lang),
        reference_path=args.ref,
        output_path=args.output,
    )
    print(json.dumps(metadata, ensure_ascii=False))


if __name__ == "__main__":
    main()
