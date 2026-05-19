from __future__ import annotations

import json
from importlib import resources
from typing import Any

CONTENT_IR_SCHEMA_VERSION = "content-ir.v1"
LOCATOR_ENVELOPE_SCHEMA_VERSION = "locator-envelope.v1"
SPEECH_PLAN_SCHEMA_VERSION = "speech-plan.v1"
HIGHLIGHT_MAP_SCHEMA_VERSION = "highlight-map.v1"
TIMING_SCHEMA_VERSION = "timing.v1"

_SCHEMA_FILES = {
    "content-ir.v1": "content-ir.v1.schema.json",
    "locator-envelope.v1": "locator-envelope.v1.schema.json",
    "speech-plan.v1": "speech-plan.v1.schema.json",
    "highlight-map.v1": "highlight-map.v1.schema.json",
    "fragment-timing.v1": "fragment-timing.v1.schema.json",
    "token-timing.v1": "token-timing.v1.schema.json",
}


def load_schema(kind: str) -> dict[str, Any]:
    try:
        filename = _SCHEMA_FILES[kind]
    except KeyError as exc:
        raise ValueError(f"unsupported schema kind: {kind}") from exc
    with resources.files("voice_studio_sdk.schema_files").joinpath(filename).open(
        "r",
        encoding="utf-8",
    ) as handle:
        return json.load(handle)


def detect_schema_kind(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    schema_version = payload.get("schemaVersion")
    if schema_version in {
        CONTENT_IR_SCHEMA_VERSION,
        LOCATOR_ENVELOPE_SCHEMA_VERSION,
        SPEECH_PLAN_SCHEMA_VERSION,
        HIGHLIGHT_MAP_SCHEMA_VERSION,
    }:
        return str(schema_version)
    if schema_version == TIMING_SCHEMA_VERSION:
        if isinstance(payload.get("fragments"), list):
            return "fragment-timing.v1"
        if isinstance(payload.get("tokens"), list):
            return "token-timing.v1"
    return None


def validate_schema(payload: Any, kind: str | None = None) -> tuple[bool, list[str]]:
    schema_kind = kind or detect_schema_kind(payload)
    if not schema_kind:
        return False, ["unsupported or missing schemaVersion"]
    if schema_kind not in _SCHEMA_FILES:
        return False, [f"unsupported schema kind: {schema_kind}"]
    if not isinstance(payload, dict):
        return False, ["payload must be a JSON object"]
    expected_version = TIMING_SCHEMA_VERSION if schema_kind.endswith("timing.v1") else schema_kind
    if payload.get("schemaVersion") != expected_version:
        return False, [f"schemaVersion must be {expected_version}"]
    required = _required_top_level_fields(schema_kind)
    missing = [field for field in required if field not in payload]
    return len(missing) == 0, [f"missing required field: {field}" for field in missing]


def _required_top_level_fields(kind: str) -> list[str]:
    if kind == "content-ir.v1":
        return ["schemaVersion", "id", "sourceId", "projectId", "nodes"]
    if kind == "locator-envelope.v1":
        return ["schemaVersion", "kind", "sourceId"]
    if kind == "speech-plan.v1":
        return ["schemaVersion", "id", "sourceId", "projectId", "generatedAt", "segments"]
    if kind == "highlight-map.v1":
        return ["schemaVersion", "status", "source", "mode", "durationMs", "fragments", "tokens"]
    if kind == "fragment-timing.v1":
        return ["schemaVersion", "source", "status", "durationMs", "fragments"]
    if kind == "token-timing.v1":
        return ["schemaVersion", "source", "status", "durationMs", "tokens"]
    return ["schemaVersion"]
