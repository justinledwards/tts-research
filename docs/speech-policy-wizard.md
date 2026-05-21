# Speech Policy Wizard

The Speech policy wizard is the default Settings surface for controlling how structured content becomes speech. It keeps the mature policy model intact while making the common path safer and more legible.

## Sections

1. **Speech profile** (`Project`)
   - Enterprise
   - Education
   - Accessibility
   - Technical Docs
   - Language Learning
   - Custom project profiles

2. **Structured content** (`Session`)
   - Tables
   - Code
   - Math
   - Citations
   - Footnotes

3. **Preview sample sentence** (`Session`)
   - Numbers
   - Abbreviations
   - Punctuation
   - Citations
   - Code
   - Table summaries

4. **JSON profiles** (`Project`)
   - Export the effective profile as `speech-policy-profile.v1`.
   - Import profile JSON as a custom project profile.

## Scope Model

The wizard shows all four settings scopes:

- `Session`: temporary speech-policy overrides for the current browser session.
- `Source`: selected-source pins, edited below the wizard.
- `Project`: default speech-policy profile and custom profiles.
- `Machine`: engine defaults and local runtime capabilities.

Source pins are intentionally separate from session overrides. Clearing a session override does not clear a source pin, and clearing a source pin returns that source to the project default.

## Advanced Controls

The previous full policy matrix remains available under **Advanced policy editor**. It should be used for exhaustive field-by-field edits, custom profile maintenance, and parity checks.

## Validation

The wizard exposes stable `data-testid` attributes for the local UI action audit:

- `speech-policy-wizard`
- `speech-policy-profile-*`
- `speech-policy-field-*`
- `speech-policy-clear-overrides`
- `speech-policy-json-export`
- `speech-policy-json-import`
- `speech-policy-import-json`
- `speech-policy-save-current`
- `speech-policy-profile-name`
- `speech-policy-update-selected`
- `speech-policy-delete-selected`

Run:

```bash
pnpm e2e:settings-ia
pnpm e2e:ui-actions
```

The UI action audit includes a dedicated `settings-speech-policy` scenario so these controls are inventoried from the Sources settings group, not only from the default Run group.
