# Settings Scope

Voice Studio settings use one shared scope vocabulary across Studio Settings, source pins, Policy Notes, and reader surfaces.

| Scope | Meaning | Examples |
|---|---|---|
| Session | Applies to the current browser session or next run. | Run mode, performance mode, pipeline toggles, session speech-policy overrides. |
| Source | Applies to the selected source until cleared. | Prepared-source and book-source speech-policy pins. |
| Project | Applies to this project by default. | Project speech-policy profile and custom policy profiles. |
| Machine | Applies to this browser or local runtime. | Reader preferences, shortcuts, theme, teleprompter focus, engine readiness, model paths, provider diagnostics. |

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
- Keyboard shortcuts live under the `Reader` task group and use `Machine` scope because they are stored for the local browser/runtime.

## Compact and Expanded Display

- Header summaries show the surface, full source title, scope title, current state, and a short metadata line. If the visible title truncates, the full source and scope names must remain available through the title tooltip and the shared context popover.
- Normal Read mode uses compact policy copy such as `Policy: Enterprise · Project` or `Policy: Accessibility · Source + Session`.
- Inspect and Review mode may expand policy into the current profile, project default, source pin, and session override layers.
- Debug and Policy Notes must keep the full trace text visible, including current profile, project default, source pin, and session override details.
- Settings panels use `Applies to Session`, `Applies to Source`, `Applies to Project`, and `Applies to Machine` as the compact form of the shared scope vocabulary.
- Workspace Intake, Review, Preview, and Teleprompt use the same source/scope/profile summary model as Cinema headers so stage changes do not rename ownership concepts.

## Local Smoke

Run the lightweight settings IA screenshot smoke with:

```bash
pnpm e2e:settings-ia
```

It captures Studio Settings, the shortcut cheat sheet, the contextual help surface, and the Workspace project-library overlay.
