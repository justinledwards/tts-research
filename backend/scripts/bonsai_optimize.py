#!/usr/bin/env python3
"""Optimize source text for TTS with local Bonsai MLX."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from mlx_lm import load, stream_generate
from mlx_lm.sample_utils import make_sampler


VOICE_OPTIMIZATION_PROMPT = """You are a voice optimization agent. You take inputs from research agents and output high quality and accurate text for a Text to Speech agent.
Your job is to replace tricky characters, measurements, formulas, or codeblocks, and rewrite text to flow in a more natural way when spoken out loud.
There are many tricky words, acronyms, onomatopoeic sounds, or regional variants that can just be avoided by writing in a better way so the TTS is less jarring."""

INSTRUCTIONS = """Rewrite the following text for accurate text-to-speech playback.
Preserve all meaning, facts, numbers, names, ordering, and technical intent.
Do not infer, approximate, soften, summarize, or add context around exact values.
Expand symbols, measurements, formulas, abbreviations, and code blocks into natural spoken language.
When a symbol is being used as an operator, speak the operator explicitly, such as plus or equals.
For title abbreviations, write the spoken word, such as doctor instead of Dr.
For complexity notation, write O(n log n) as O of n log n.
Optimize only the text inside <text> tags.
Return only the optimized spoken text. Do not include tags, wrappers, commentary, markdown fences, labels, or summaries."""

FEW_SHOTS = [
    (
        "CPU usage is 90% + memory = 4GB.",
        "CPU usage is ninety percent plus memory equals four gigabytes.",
    ),
    (
        "p95 latency = 280ms & temp is 37°C.",
        "P ninety five latency equals two hundred eighty milliseconds and temperature is thirty seven degrees Celsius.",
    ),
    (
        '```go\nfmt.Println("hello")\n```',
        "Go code sample: fmt dot Println, open parenthesis, quote hello quote, close parenthesis.",
    ),
    (
        "Dr. Smith reviewed GPU and ASR metrics.",
        "Doctor Smith reviewed G P U and A S R metrics.",
    ),
    (
        "If x <= 3 && y != 0, return O(n log n).",
        "If x is less than or equal to three and y is not equal to zero, return O of n log n.",
    ),
]


def main() -> None:
    args = parse_args()
    model, tokenizer = load(args.model)
    sampler = make_sampler(temp=args.temperature, top_p=args.top_p, top_k=args.top_k)

    if args.server:
        run_server(args, model, tokenizer, sampler)
        return

    text = args.text
    if text is None and args.text_file:
        text = args.text_file.read_text()
    if not text:
        raise SystemExit("--text or --text-file is required unless --server is set")

    optimized = optimize_text(model, tokenizer, sampler, text, args.max_tokens, None)
    print(optimized)


def run_server(args: argparse.Namespace, model: Any, tokenizer: Any, sampler: Any) -> None:
    ready = {
        "type": "ready",
        "provider": "bonsai",
        "model": args.model,
    }
    print(json.dumps(ready, ensure_ascii=False), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        request_id = ""
        try:
            request = json.loads(line)
            request_id = str(request.get("id") or "")
            text = str(request.get("text") or "")
            max_tokens = int(request.get("maxTokens") or args.max_tokens)
            optimized = optimize_text(
                model,
                tokenizer,
                sampler,
                text,
                max_tokens,
                lambda delta: emit({"id": request_id, "type": "delta", "text": delta}),
            )
            emit({"id": request_id, "type": "final", "text": optimized})
        except Exception as error:  # noqa: BLE001 - worker returns structured errors to Go.
            emit({"id": request_id, "type": "error", "error": str(error)})


def optimize_text(
    model: Any,
    tokenizer: Any,
    sampler: Any,
    text: str,
    max_tokens: int,
    on_delta: Any,
) -> str:
    prompt = tokenizer.apply_chat_template(
        build_messages(text),
        tokenize=False,
        add_generation_prompt=True,
    )

    pieces: list[str] = []
    for response in stream_generate(
        model,
        tokenizer,
        prompt,
        max_tokens=max_tokens,
        sampler=sampler,
    ):
        delta = str(getattr(response, "text", "") or "")
        if not delta:
            continue
        pieces.append(delta)
        if on_delta:
            on_delta(delta)

    return clean_output("".join(pieces))


def build_messages(text: str) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": VOICE_OPTIMIZATION_PROMPT}]
    for input_text, output_text in FEW_SHOTS:
        messages.append({"role": "user", "content": user_prompt(input_text)})
        messages.append({"role": "assistant", "content": output_text})
    messages.append({"role": "user", "content": user_prompt(text)})

    return messages


def user_prompt(text: str) -> str:
    return "\n".join([INSTRUCTIONS, "", "<text>", text, "</text>"])


def clean_output(value: str) -> str:
    text = value.strip()
    for prefix in ("```text", "```markdown", "```"):
        if text.lower().startswith(prefix):
            text = text[len(prefix) :].strip()
            break
    if text.endswith("```"):
        text = text[:-3].strip()

    return text


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Bonsai voice optimization.")
    parser.add_argument("--server", action="store_true")
    parser.add_argument("--text")
    parser.add_argument("--text-file", type=Path)
    parser.add_argument("--model", default="prism-ml/Bonsai-8B-mlx-1bit")
    parser.add_argument("--max-tokens", default=4096, type=int)
    parser.add_argument("--temperature", default=0.1, type=float)
    parser.add_argument("--top-p", default=0.9, type=float)
    parser.add_argument("--top-k", default=20, type=int)
    return parser.parse_args()


if __name__ == "__main__":
    main()
