# Python SDK Examples

```py
from voice_studio_sdk import VoiceStudioClient, validate_schema

client = VoiceStudioClient("http://127.0.0.1:8080")
content_ir = client.get_content_ir("source-id")

valid, errors = validate_schema(content_ir)
if not valid:
    raise RuntimeError(errors)

speech_plan = client.get_source_speech_plan("source-id")
print(len(speech_plan["segments"]))
```

The Python package is intentionally thin and stdlib-first. It is for local integration and schema/client smoke tests until release packaging is finalized.
