# Private Packaging and Versioning

Workstream MU packages are local-packable only:

- npm packages are private and use version `0.0.0`;
- Python package builds a local wheel named `voice-studio-sdk`;
- package smoke tests install packed artifacts into fresh temporary projects;
- registry publishing is blocked until Omega/legal finalisation.

Do not add license files, legal notices, provenance attestations, or hosted release gates in MU. Future public releases should introduce those artifacts as a separate Omega-scoped change.

Validation commands:

```bash
pnpm check
pnpm validate:local
pnpm package:smoke
pnpm cli:parity
```
