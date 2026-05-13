#!/usr/bin/env python3
"""Optimize source text for TTS with local Bonsai MLX."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


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

MAX_CHUNK_RUNES = 1_600

DOMAIN_PATTERN = re.compile(
    r"(?i)(?:\*\.)?(?:[a-z0-9][a-z0-9-]*\.)+(?:us|org|com|net|edu|gov|io|dev|co)\b"
)
ITALIC_DOMAIN_PATTERN = re.compile(
    r"(?i)\*((?:[a-z0-9][a-z0-9-]*\.)+(?:us|org|com|net|edu|gov|io|dev|co))\*"
)
EMAIL_PATTERN = re.compile(
    r"(?i)\b([a-z0-9._%+-]+)@((?:[a-z0-9][a-z0-9-]*\.)+(?:us|org|com|net|edu|gov|io|dev|co))\b"
)
DATE_PATTERN = re.compile(
    r"\b([0-3]?\d)\s+"
    r"(January|February|March|April|May|June|July|August|September|October|November|December|"
    r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
    r"\s+(\d{4})\b",
    re.IGNORECASE,
)
SECTION_REF_PATTERN = re.compile(r"\b(\d+)([a-z])(?:-([a-z]))?\b", re.IGNORECASE)
NUMBER_RANGE_PATTERN = re.compile(r"\b(\d+)\s*-\s*(\d+)\b")
VERSION_PATTERN = re.compile(r"\bv(\d+)\.(\d+)\b", re.IGNORECASE)
MARKDOWN_LINK_PATTERN = re.compile(r"\[([^\]]+)]\([^)]+\)")
MARKDOWN_EMPHASIS_PATTERN = re.compile(r"(?<!\w)([*_]{1,2})([^*_]+)\1(?!\w)")

ACRONYMS = {
    "ASR": "A S R",
    "AWS": "A W S",
    "CPU": "C P U",
    "DNS": "D N S",
    "FAQ": "F A Q",
    "FTP": "F T P",
    "GPU": "G P U",
    "HRV": "H R V",
    "HTML": "H T M L",
    "HTTP": "H T T P",
    "HTTPS": "H T T P S",
    "IP": "I P",
    "TLD": "T L D",
    "TTS": "T T S",
    "URL": "U R L",
    "US": "U S",
    "USB": "U S B",
    "WHOIS": "who is",
}

MONTHS = {
    "jan": "January",
    "january": "January",
    "feb": "February",
    "february": "February",
    "mar": "March",
    "march": "March",
    "apr": "April",
    "april": "April",
    "may": "May",
    "jun": "June",
    "june": "June",
    "jul": "July",
    "july": "July",
    "aug": "August",
    "august": "August",
    "sep": "September",
    "sept": "September",
    "september": "September",
    "oct": "October",
    "october": "October",
    "nov": "November",
    "november": "November",
    "dec": "December",
    "december": "December",
}


def main() -> None:
    args = parse_args()
    if args.normalize_only:
        text = args.text
        if text is None and args.text_file:
            text = args.text_file.read_text(encoding="utf-8")
        if not text:
            raise SystemExit("--text or --text-file is required")

        print(normalize_for_tts(text))
        return

    from mlx_lm import load, stream_generate
    from mlx_lm.sample_utils import make_sampler

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

    optimized = optimize_text(model, tokenizer, sampler, text, args.max_tokens, args.chunk_runes, None)
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
                args.chunk_runes,
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
    chunk_runes: int,
    on_delta: Any,
) -> str:
    chunks = split_text_chunks(normalize_for_tts(text), chunk_runes)
    optimized_chunks: list[str] = []
    for index, chunk in enumerate(chunks):
        if index > 0 and on_delta:
            on_delta("\n\n")
        optimized_chunks.append(
            optimize_chunk(model, tokenizer, sampler, chunk, max_tokens, on_delta)
        )

    return normalize_for_tts("\n\n".join(optimized_chunks))


def optimize_chunk(
    model: Any,
    tokenizer: Any,
    sampler: Any,
    text: str,
    max_tokens: int,
    on_delta: Any,
) -> str:
    from mlx_lm import stream_generate

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


def normalize_for_tts(value: str) -> str:
    text = value.replace("\r\n", "\n")
    text = MARKDOWN_LINK_PATTERN.sub(r"\1", text)
    text = re.sub(r"(?i)\btl\s*;\s*dr\b", "Too long; didn't read", text)
    text = VERSION_PATTERN.sub(lambda match: f"version {number_to_words(int(match.group(1)))} point {number_to_words(int(match.group(2)))}", text)
    text = DATE_PATTERN.sub(format_date, text)
    text = EMAIL_PATTERN.sub(format_email, text)
    text = ITALIC_DOMAIN_PATTERN.sub(lambda match: format_domain("*." + match.group(1)), text)
    text = DOMAIN_PATTERN.sub(lambda match: format_domain(match.group(0)), text)
    text = re.sub(r"(?i)\.US\b", "dot U S", text)
    text = SECTION_REF_PATTERN.sub(format_section_ref, text)
    text = NUMBER_RANGE_PATTERN.sub(
        lambda match: f"{number_to_words(int(match.group(1)))} to {number_to_words(int(match.group(2)))}",
        text,
    )
    text = MARKDOWN_EMPHASIS_PATTERN.sub(r"\2", text)
    text = replace_acronyms(text)
    text = text.replace("≤", " less than or equal to ")
    text = text.replace(">=", " greater than or equal to ")
    text = text.replace("<=", " less than or equal to ")
    text = text.replace("!=", " not equal to ")
    text = text.replace("&&", " and ")
    text = text.replace("&", " and ")
    text = text.replace("%", " percent")
    text = text.replace("°", " degrees ")
    text = text.replace("=", " equals ")
    text = text.replace("+", " plus ")
    text = text.replace("―", " - ")
    text = text.replace("...", ".")

    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def split_text_chunks(text: str, max_runes: int) -> list[str]:
    max_size = max_runes if max_runes > 0 else MAX_CHUNK_RUNES
    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n{2,}", text) if paragraph.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        for piece in split_long_paragraph(paragraph, max_size):
            candidate = piece if not current else f"{current}\n\n{piece}"
            if len(candidate) <= max_size:
                current = candidate
                continue

            if current:
                chunks.append(current)
            current = piece

    if current:
        chunks.append(current)

    return chunks or [text]


def split_long_paragraph(paragraph: str, max_size: int) -> list[str]:
    if len(paragraph) <= max_size:
        return [paragraph]

    sentences = re.split(r"(?<=[.!?])\s+", paragraph)
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        if len(sentence) > max_size:
            if current:
                pieces.append(current)
                current = ""
            pieces.extend(split_by_words(sentence, max_size))
            continue

        candidate = sentence if not current else f"{current} {sentence}"
        if len(candidate) <= max_size:
            current = candidate
            continue

        pieces.append(current)
        current = sentence

    if current:
        pieces.append(current)

    return pieces


def split_by_words(text: str, max_size: int) -> list[str]:
    pieces: list[str] = []
    current = ""
    for word in text.split():
        candidate = word if not current else f"{current} {word}"
        if len(candidate) <= max_size:
            current = candidate
            continue
        if current:
            pieces.append(current)
        current = word
    if current:
        pieces.append(current)

    return pieces


def format_email(match: re.Match[str]) -> str:
    local = match.group(1).replace(".", " dot ").replace("_", " underscore ").replace("-", " dash ")
    return f"{local} at {format_domain(match.group(2))}"


def format_domain(value: str) -> str:
    domain = value.strip().strip(".,;:)")
    wildcard = False
    if domain.startswith("*."):
        wildcard = True
        domain = domain[2:]

    labels = domain.split(".")
    spoken: list[str] = []
    if wildcard:
        spoken.extend(["wildcard", "dot"])

    for index, label in enumerate(labels):
        if index > 0:
            spoken.append("dot")
        spoken.append(format_domain_label(label, index == len(labels) - 1, labels))

    return " ".join(spoken)


def format_domain_label(label: str, is_tld: bool, labels: list[str]) -> str:
    normalized = label.lower()
    if normalized == "us":
        return "U S"
    if is_tld and normalized in {"io", "co"}:
        return " ".join(normalized.upper())
    if normalized in {"wa", "oh"} and labels[-1].lower() == "us":
        return " ".join(normalized.upper())

    return normalized.replace("-", " dash ")


def format_date(match: re.Match[str]) -> str:
    day = int(match.group(1))
    month = MONTHS[match.group(2).lower()]
    year = int(match.group(3))
    return f"{month} {ordinal_to_words(day)}, {year_to_words(year)}"


def format_section_ref(match: re.Match[str]) -> str:
    number = number_to_words(int(match.group(1)))
    first_letter = match.group(2).upper()
    last_letter = match.group(3)
    if not last_letter:
        return f"{number} {first_letter}"

    return f"{number} {first_letter} through {last_letter.upper()}"


def replace_acronyms(text: str) -> str:
    for acronym, spoken in ACRONYMS.items():
        text = re.sub(rf"\b{re.escape(acronym)}\b", spoken, text)

    return text


def ordinal_to_words(value: int) -> str:
    ordinals = {
        1: "first",
        2: "second",
        3: "third",
        4: "fourth",
        5: "fifth",
        6: "sixth",
        7: "seventh",
        8: "eighth",
        9: "ninth",
        10: "tenth",
        11: "eleventh",
        12: "twelfth",
        13: "thirteenth",
        14: "fourteenth",
        15: "fifteenth",
        16: "sixteenth",
        17: "seventeenth",
        18: "eighteenth",
        19: "nineteenth",
        20: "twentieth",
        21: "twenty first",
        22: "twenty second",
        23: "twenty third",
        24: "twenty fourth",
        25: "twenty fifth",
        26: "twenty sixth",
        27: "twenty seventh",
        28: "twenty eighth",
        29: "twenty ninth",
        30: "thirtieth",
        31: "thirty first",
    }

    return ordinals.get(value, str(value))


def year_to_words(value: int) -> str:
    if 2000 <= value <= 2099:
        remainder = value - 2000
        if remainder == 0:
            return "two thousand"
        return f"twenty {number_to_words(remainder)}"

    return number_to_words(value)


def number_to_words(value: int) -> str:
    small = [
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
        "eighteen",
        "nineteen",
    ]
    tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
    if value < 20:
        return small[value]
    if value < 100:
        ten, remainder = divmod(value, 10)
        return tens[ten] if remainder == 0 else f"{tens[ten]} {small[remainder]}"
    if value < 1_000:
        hundred, remainder = divmod(value, 100)
        return f"{small[hundred]} hundred" if remainder == 0 else f"{small[hundred]} hundred {number_to_words(remainder)}"
    if value < 10_000:
        thousand, remainder = divmod(value, 1_000)
        return f"{small[thousand]} thousand" if remainder == 0 else f"{small[thousand]} thousand {number_to_words(remainder)}"

    return str(value)


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
    parser.add_argument("--chunk-runes", default=MAX_CHUNK_RUNES, type=int)
    parser.add_argument("--temperature", default=0.1, type=float)
    parser.add_argument("--top-p", default=0.9, type=float)
    parser.add_argument("--top-k", default=20, type=int)
    parser.add_argument("--normalize-only", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    main()
