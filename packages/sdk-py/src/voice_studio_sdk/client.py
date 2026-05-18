from __future__ import annotations

import json
import mimetypes
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class BundleExport:
    data: bytes
    content_type: str
    filename: str | None = None


class VoiceStudioClient:
    def __init__(self, base_url: str = "http://127.0.0.1:8080", timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get_content_ir(self, source_id: str, schema_version: str | None = None) -> dict[str, Any]:
        query = ""
        if schema_version:
            query = "?" + urllib.parse.urlencode({"schemaVersion": schema_version})
        return self._json("GET", f"/api/content-ir/{urllib.parse.quote(source_id)}{query}")

    def get_source_speech_plan(self, source_id: str) -> dict[str, Any]:
        return self._json("GET", f"/api/content-ir/{urllib.parse.quote(source_id)}/speech-plan")

    def get_job_speech_plan(self, job_id: str) -> dict[str, Any]:
        return self._json("GET", f"/api/voice-jobs/{urllib.parse.quote(job_id)}/speech-plan")

    def get_highlight_map(self, job_id: str) -> dict[str, Any]:
        return self._json("GET", f"/api/voice-jobs/{urllib.parse.quote(job_id)}/highlight-map")

    def get_fragment_timing(self, job_id: str) -> dict[str, Any]:
        return self._json("GET", f"/api/voice-jobs/{urllib.parse.quote(job_id)}/timing/fragments")

    def get_token_timing(self, job_id: str) -> dict[str, Any]:
        return self._json("GET", f"/api/voice-jobs/{urllib.parse.quote(job_id)}/timing/tokens")

    def import_prepared_source(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._json(
            "POST",
            f"/api/projects/{urllib.parse.quote(project_id)}/source-preps",
            payload,
        )

    def import_book_source_from_url(
        self,
        project_id: str,
        url: str,
        import_profile: str | None = None,
        pdf_table_mode: str | None = None,
    ) -> dict[str, Any]:
        payload = {"url": url}
        if import_profile:
            payload["importProfile"] = import_profile
        if pdf_table_mode:
            payload["pdfTableMode"] = pdf_table_mode
        return self._json(
            "POST",
            f"/api/projects/{urllib.parse.quote(project_id)}/book-sources",
            payload,
        )

    def import_book_source_file(
        self,
        project_id: str,
        file_path: str | Path,
        import_profile: str | None = None,
        pdf_table_mode: str | None = None,
    ) -> dict[str, Any]:
        path = Path(file_path)
        fields = {}
        if import_profile:
            fields["importProfile"] = import_profile
        if pdf_table_mode:
            fields["pdfTableMode"] = pdf_table_mode
        body, content_type = _multipart_body("file", path, fields)
        return self._request_json(
            "POST",
            f"/api/projects/{urllib.parse.quote(project_id)}/book-sources",
            body,
            {"Content-Type": content_type},
        )

    def export_project_bundle(self, project_id: str) -> BundleExport:
        response = self._request("GET", f"/api/projects/{urllib.parse.quote(project_id)}/bundle")
        data = response.read()
        return BundleExport(
            data=data,
            content_type=response.headers.get("content-type", "application/zip"),
            filename=_filename_from_content_disposition(response.headers.get("content-disposition")),
        )

    def _json(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {} if body is None else {"Content-Type": "application/json"}
        return self._request_json(method, path, body, headers)

    def _request_json(
        self,
        method: str,
        path: str,
        body: bytes | None,
        headers: dict[str, str],
    ) -> dict[str, Any]:
        response = self._request(method, path, body, headers)
        return json.loads(response.read().decode("utf-8"))

    def _request(
        self,
        method: str,
        path: str,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ):
        request = urllib.request.Request(
            self.base_url + path,
            data=body,
            headers=headers or {},
            method=method,
        )
        try:
            return urllib.request.urlopen(request, timeout=self.timeout)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(detail or f"HTTP {error.code}") from error


def _multipart_body(
    field_name: str,
    path: Path,
    fields: dict[str, str],
) -> tuple[bytes, str]:
    boundary = "voice-studio-sdk-boundary"
    chunks: list[bytes] = []
    for key, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode(),
                value.encode(),
                b"\r\n",
            ]
        )
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    chunks.extend(
        [
            f"--{boundary}\r\n".encode(),
            (
                f'Content-Disposition: form-data; name="{field_name}"; '
                f'filename="{path.name}"\r\n'
            ).encode(),
            f"Content-Type: {mime_type}\r\n\r\n".encode(),
            path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _filename_from_content_disposition(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r'filename="?([^";]+)"?', value, re.IGNORECASE)
    return match.group(1) if match else None
