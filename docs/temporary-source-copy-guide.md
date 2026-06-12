# Temporary Source Copy Guide

Temporary source language must make persistence, locality, expiry, and provider boundaries explicit. Use the shared frontend catalog in `frontend/src/features/temporary-source-copy.ts` for UI strings that appear in temporary-source flows.

## Language Principles

- Name the persistence scope in every temporary-source action: temporary source, generated temporary audio, durable project source, project history, or project source pin.
- Use `Keep in project` for the durable action. Use `Promote with audio` and `Promote source only` only inside the promotion manifest or final promotion choice.
- Use `Discard temporary source` for deletion. Never use a bare `Discard` where a user could confuse temporary work with a project source.
- Use `Expires after inactivity` as lifecycle copy. Present expiry as a cleanup rule, not as a warning that content is unsafe.
- Use `provider-backed` only when data may leave the local runtime. Say what can be sent: request text, selected voice settings, and run configuration.
- Keep durable project workflows on durable-project language: project source, project history, source pin, project export, and project defaults.

## Recommended Vocabulary

| Concept | Preferred copy |
| --- | --- |
| Disposable input | Temporary source |
| Durable action | Keep in project |
| Delete action | Discard temporary source |
| Expiry | Expires after inactivity |
| Review-only state | Session-only review note |
| Voice choice | Session voice override |
| Durable policy | Project source pin |
| Temporary audio | Generated temporary audio |
| Keep with audio | Promote with audio |
| Keep without audio | Promote source only |
| Cleanup | Clear expired temporary work |

Avoid `Save`, `Import` for temporary-only intake, bare `Project`, bare `History`, bare `Ready`, and bare `Discard` in temporary-source flows.

## Copy Locations

| Location | Required copy behavior |
| --- | --- |
| Quick Listen launcher | State that Quick Listen creates temporary source work, not a durable project source. Mention expiry, discard, and Keep in project. |
| Temporary source header | Show `Temporary source`, status, and expiry. Actions use `Keep in project` and `Discard temporary source`. |
| Status strip | Use `Temporary source: <title>` for temporary work and `Source: <title>` for project sources. |
| Inspector Overview | Show history scope as temporary-session-only until Keep in project. |
| Promotion dialog | Title is `Keep in project`. Manifest says what becomes durable project history. Final action is `Promote with audio` or `Promote source only`. |
| Discard confirmation | Say deleted content includes temporary source text, generated temporary audio, timing, bookmarks, progress, review notes, and diagnostics. Say project sources are unchanged. |
| Settings temporary defaults | Explain that settings apply until expiry, discard, or Keep in project. Separate reset UI memory from temporary cleanup. |
| Command Palette descriptions | Start each temporary command description with `Temporary source` or `Temporary storage` and name the persistence result. |
| Command Center temporary shelf | Use management labels: `Open temporary source`, `Keep in project`, `Discard temporary source`, `Clear expired temporary work`. |
| Cinema More sheet | Keep narrow-screen action labels identical to header actions. |
| Expired source recovery screen | Say the source expired after inactivity and can be reopened only after Extend expiry, when available. |

## Confirmation Copy

- Discard temporary source: `Discard temporary source now? This deletes temporary source text, generated temporary audio, timing, bookmarks, progress, review notes, and diagnostics from this session. Project sources are unchanged.`
- Remove generated temporary audio: `Remove generated temporary audio for this session? Temporary source text and session-only review state will remain.`
- Remove all temporary artifacts: `Remove all temporary artifacts for this session? Recovery metadata remains, but temporary source text, generated temporary audio, timing, bookmarks, and progress will be cleaned. Project sources are unchanged.`

## Error And Failure Copy

- Expired: `Temporary source expired after inactivity. Extend expiry before reopening it.`
- Discarded: `Temporary source was discarded. Start Quick Listen again to create a new temporary source.`
- Not ready: `This temporary source is not ready for review or audio.`
- Keep failed: `Unable to keep temporary source in the project. No project history was changed.`
- Cleanup empty: `No expired temporary sources are ready to clear.`

## Empty-State Copy

- No recent temporary sources: `Recent temporary sources appear here after you start Quick Listen in this app session.`
- No active temporary source: `Open or select a temporary source first.`
- No matching recovery items: `No temporary sources match this filter. Start Quick Listen to create temporary work without adding anything to the project library.`

## Promotion Manifest Copy

Use `Durable project history will include:` as the manifest intro. Items must use project-scope terms:

- `Temporary source text`
- `Session-only review note`, when notes are included
- `Session voice override`, when session pronunciation or voice overrides are included
- `Project source pin`, when policy is copied as a durable pin
- `Generated temporary audio`, when audio is included

## Privacy And Local-First Alignment

Temporary source content stays local unless the user chooses a provider-backed feature. Provider-backed generation can send request text, selected voice settings, and run configuration to the configured provider. `Keep in project` creates a durable project source. `Discard temporary source` deletes only temporary work and does not change project sources.
