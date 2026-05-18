# Contract Compatibility Matrix

| Contract | Status | Compatible Readers | Notes |
| --- | --- | --- | --- |
| `content-ir.v1` | Public stable | Backend, frontend, generated TypeScript, schema bundle consumers | First public Content IR release. Breaking changes require `content-ir.v2`. |
| `locator-envelope.v1` | Public stable | Backend Readium bridge, frontend resume/highlight helpers | References released `content-ir.v1` locators. |
| `speech-plan.v1` | Public stable | Backend speech plan builders, frontend/API consumers | References `locator-envelope.v1` and released `content-ir.v1` speech policy/pronunciation definitions. |
| Pre-release internal `content-ir.v1` | Private read compatibility only | Backend JSON reader | Older EPUB-as-HTML locators are normalized into released `content-ir.v1`; consumers should not emit this shape. |

Compatibility rules:

- Public producers emit only the stable contracts listed above.
- Public consumers should reject unknown major versions.
- Additive fields may be introduced only when existing readers can safely ignore them.
- Incompatible wire-shape changes require a new versioned schema and migration notes.
