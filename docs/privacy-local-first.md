# Local-first Privacy Boundaries

Voice Studio is designed as a local-first app: source prep, review, preview, generated audio,
playback progress, UI memory, and project bundles are handled by the local runtime unless a user
selects a provider-backed feature.

## Runtime Modes

| Mode | Boundary | Notes |
|---|---|---|
| `pnpm start:mock` | Local/mock | No provider secrets or hosted TTS calls are required. Mock output is deterministic for review and demos. |
| `pnpm start:local` | Local provider where configured | Local engines can read source text and voice settings on this machine. Optional model caches live in ignored runtime paths. |
| Provider-backed runtime | External provider | Generation can send request text, voice settings, and run configuration to the configured provider. Use mock/local mode before preparing sensitive content. |

Settings > Runtime shows the active provider, available capabilities, missing capabilities, and the
provider boundary used by provider-gated controls.

## Stored Local Data

Ignored runtime directories contain project and generated data:

- `backend/data/projects/`: project metadata and speech-policy profiles.
- `backend/data/source-preps/`: prepared files, pasted text, URL extraction output, and Website Cinema metadata.
- `backend/data/book-sources/`: imported book/document source metadata and extracted text.
- `backend/data/jobs/`: generated audio, timing artifacts, quality reports, and job metadata.
- `backend/data/voice-profiles/` and `backend/data/voice-profile-sources/`: voice recordings, references, candidates, and clone artifacts.
- browser local storage: UI memory preferences, theme, layout, reader settings, shortcuts, and last-project memory when enabled.

Provider secrets, local credential files, model caches, and model paths are runtime configuration;
they are not UI memory exports and are not normal project bundle content.

## URL Intake

URL intake is fetched by the local backend, then extracted into local source-prep storage. The
backend accepts `http` and `https` URLs only.

By default, the backend blocks URLs that resolve to local or private network addresses. Set
`VOICE_SOURCE_URL_ALLOW_PRIVATE=true` only when intentionally testing local fixtures or private
intranet content. The UI warns before URL intake when a URL appears external, private-network, local,
invalid, or unsupported.

Failure states are explicit:

- external URL fetch: the local backend downloads readable content before extraction;
- private/local IP URL: blocked unless private URL intake is enabled;
- unsupported scheme or content type: extraction is stopped before a prepared source is saved;
- failed extraction: no prepared source is stored.

## Project Export And Import

Project bundles are explicit portable exports. The export panel previews contents before download.

Included by default:

- project metadata and run configuration;
- prepared source text and normalized script;
- generated audio and waveform artifacts when present;
- voice profile reference audio used by exported jobs;
- telemetry, quality reports, and reading settings.

Excluded by default:

- provider secrets and credential files;
- model cache directories and absolute model paths;
- browser UI memory preferences;
- raw uploaded PDF/EPUB files, unless represented by prepared metadata.

Import previews the bundle manifest before mutating local projects. The safe default imports a copy
as a new project; merge and replace are explicit choices.

## UI Memory

UI memory is browser-local presentation state. It can remember layout, theme, last project, reader
preferences, Teleprompt return memory, and panel pins.

UI memory export is a preferences JSON document only. It omits generated audio, model paths,
provider secrets, private project content, and raw Teleprompt script snapshots. Imported UI memory
accepts known preference fields only.

## Voice Profiles

Voice profile source data is local unless the user configures a provider-backed or optional research
module workflow. Source recordings, cleaned references, candidates, clone targets, and clone
artifacts live in local voice-profile data. Project bundles include voice reference audio only when
exported jobs depend on those profiles.

## Validation

Use local validation to confirm the boundary UX without hosted CI:

```sh
pnpm check
pnpm e2e:settings-ia
pnpm e2e:ui-actions
pnpm validate:live-ingestion
pnpm validate:local
```
