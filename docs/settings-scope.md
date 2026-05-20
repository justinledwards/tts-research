# Settings Scope

Voice Studio settings use one shared scope vocabulary across Studio Settings, source pins, Policy Notes, and reader surfaces.

| Scope | Meaning | Examples |
|---|---|---|
| Session | Applies to the current browser session or next run. | Run mode, performance mode, pipeline toggles, session speech-policy overrides. |
| Source | Applies to the selected source until cleared. | Prepared-source and book-source speech-policy pins. |
| Project | Applies to this project by default. | Project speech-policy profile and custom policy profiles. |
| Machine | Applies to this browser or local runtime. | Reader preferences, theme, teleprompter focus, engine readiness, model paths, provider diagnostics. |

## Precedence

Speech policy still resolves in the same order:

1. Session overrides win for the current preview or job request.
2. Source pins apply to a prepared source or book source until cleared.
3. Project defaults apply to unpinned sources.
4. `Enterprise` is the fallback when no project/profile can be resolved.

## UI Contract

- Studio Settings is organized by task: `Run`, `Reader`, `Voices`, `Sources`, `Runtime`, and `Diagnostics`.
- Quick settings expose the most common session, project, and machine changes before the detailed groups.
- Scope badges and “applies to” copy must come from shared settings metadata, not hand-written text in each panel.
- Source pin editors and Policy Scope chips use the same `Session`, `Source`, `Project`, and `Machine` labels as Studio Settings.

## Local Smoke

Run the lightweight settings IA screenshot smoke with:

```bash
pnpm e2e:settings-ia
```

It captures Studio Settings, the contextual help surface, and the Workspace project-library overlay.
