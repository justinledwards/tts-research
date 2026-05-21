# Run Configuration Wizard

The Run configuration wizard is the default Settings surface for choosing how the next Studio run is created. It keeps advanced controls available, but the normal path is a single guided flow.

## Sections

1. **Output intent** (`Session`)
   - Draft Preview
   - Fast Create
   - Checked Master
   - Publish Master

2. **Engine** (`Session`)
   - Mock/local
   - Kokoro
   - Supertonic
   - Configured provider

3. **Voice** (`Session`)
   - Default voice
   - Saved profile
   - Cloned profile

4. **Speech profile** (`Project`)
   - Uses the same project policy profile that Review, Preview, Teleprompt, and Cinema resolve.
   - Detailed policy editing stays in the Speech policy wizard.

5. **Structured content** (`Session`)
   - Text preprocessing
   - Arrival playback
   - Checker
   - Retry rejected segments
   - Quality report

6. **Preview sample** (`Session`)
   - Summarizes performance mode, voice path, preprocessing, checker gates, retries, and reporting before Create & Listen.

## Scope Model

Run configuration choices are session-scoped unless noted otherwise. The speech profile selector is project-scoped because it changes the default policy used by the source workflow.

The wizard preserves the existing advanced controls under **Advanced run controls**. That disclosure is for operator tuning and parity checks, not the primary user path.

## Validation

The wizard exposes stable `data-testid` attributes for the local UI action audit:

- `run-configuration-wizard`
- `run-config-intent-*`
- `run-config-engine-*`
- `run-config-kokoro-*`
- `run-config-voice-*`
- `run-config-speech-profile`
- `run-config-pipeline-*`

Run:

```bash
pnpm e2e:ui-actions
```
