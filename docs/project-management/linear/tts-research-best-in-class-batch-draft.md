# TTS-Research best-in-class UX/performance batch — candidate

Status: `candidate_pending_chatgpt`

Proposed issues: **16 / 20 cap**

No issue may be created in Linear until the archive-backed peer gate returns the required marker.

## Ordered issues

### BIC-00 — Best-in-class UX/performance batch closeout

- Kind: `parent`
- Depends on: `BIC-01, BIC-02, BIC-03, BIC-04, BIC-05, BIC-06, BIC-07, BIC-08, BIC-09, BIC-10, BIC-11, BIC-12, BIC-13, BIC-14, BIC-15`
- Atomic deliverable: Close only after all children, visual evidence, budgets, flow coverage, and peer gates pass.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Close only after all children, visual evidence, budgets, flow coverage, and peer gates pass.

### BIC-01 — CPU-first startup availability and fail-fast diagnostics

- Kind: `implementation`
- Depends on: `none`
- Atomic deliverable: Default lean CPU path binds custom ports, performs zero eager model/provider work, and every startup probe is bounded.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Default lean CPU path binds custom ports, performs zero eager model/provider work, and every startup probe is bounded.

### BIC-02 — Flow registry schema and report-only semantic validator

- Kind: `architecture`
- Depends on: `BIC-01`
- Atomic deliverable: Validate IDs, owners, Mermaid metadata, paths, branches, route inventory, states, and generated index without enforcing CI yet.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Validate IDs, owners, Mermaid metadata, paths, branches, route inventory, states, and generated index without enforcing CI yet.

### BIC-03 — Application shell, navigation, command, and project flow contracts

- Kind: `architecture`
- Depends on: `BIC-02`
- Atomic deliverable: Canonicalize APP and PRJ flows with route/state/test mapping.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Canonicalize APP and PRJ flows with route/state/test mapping.

### BIC-04 — Durable, URL, temporary, promotion, and review source flow contracts

- Kind: `architecture`
- Depends on: `BIC-02`
- Atomic deliverable: Canonicalize SRC flows including URL trust boundary and rollback.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Canonicalize SRC flows including URL trust boundary and rollback.

### BIC-05 — Policy, preview, Teleprompt, and settings flow contracts

- Kind: `architecture`
- Depends on: `BIC-02`
- Atomic deliverable: Canonicalize effective settings and audition/return recovery.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Canonicalize effective settings and audition/return recovery.

### BIC-06 — Voice source, profile, and target lifecycle contracts

- Kind: `architecture`
- Depends on: `BIC-02`
- Atomic deliverable: Canonicalize voice state machines, cancellation, missing-tool, and no-eager-model behavior.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Canonicalize voice state machines, cancellation, missing-tool, and no-eager-model behavior.

### BIC-07 — Job, event, persistence, and artifact lifecycle contracts

- Kind: `architecture`
- Depends on: `BIC-02`
- Atomic deliverable: Canonicalize synthesis/check/retry/interruption/currentness and SSE snapshot recovery.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Canonicalize synthesis/check/retry/interruption/currentness and SSE snapshot recovery.

### BIC-08 — Reader, playback, Cinema, Theatre, progress, and repair contracts

- Kind: `architecture`
- Depends on: `BIC-02`
- Atomic deliverable: Canonicalize partial audio, fidelity degradation, safe return, remap, and rebuild.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Canonicalize partial audio, fidelity degradation, safe return, remap, and rebuild.

### BIC-09 — Portability, UI memory, recovery, boundary, and diagnostics contracts

- Kind: `architecture`
- Depends on: `BIC-02`
- Atomic deliverable: Canonicalize transactional import/export, context pruning, error ownership, and data boundaries.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Canonicalize transactional import/export, context pruning, error ownership, and data boundaries.

### BIC-10 — Behavior-preserving App.tsx shell/domain extraction

- Kind: `performance`
- Depends on: `BIC-03, BIC-04, BIC-05, BIC-06, BIC-07, BIC-08, BIC-09`
- Atomic deliverable: Reduce App.tsx below 2,000 lines, keep shared handlers, preserve behavior and lazy chunks; no UI redesign in this issue.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Reduce App.tsx below 2,000 lines, keep shared handlers, preserve behavior and lazy chunks; no UI redesign in this issue.

### BIC-11 — Project library and intake UX visual hierarchy

- Kind: `ux`
- Depends on: `BIC-10`
- Atomic deliverable: Implement one-primary-action project/intake journey with complete empty/loading/failure/resume states and approved screenshots.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Implement one-primary-action project/intake journey with complete empty/loading/failure/resume states and approved screenshots.

### BIC-12 — Workspace review, preview, and generation UX polish

- Kind: `ux`
- Depends on: `BIC-10, BIC-11`
- Atomic deliverable: Polish task hierarchy, progress, retry/cancel, and capability messaging without duplicate actions.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Polish task hierarchy, progress, retry/cancel, and capability messaging without duplicate actions.

### BIC-13 — Reader, Cinema, Teleprompt, and Theatre responsive polish

- Kind: `ux`
- Depends on: `BIC-10, BIC-12`
- Atomic deliverable: Content-first responsive layout with non-occluding controls and shared navigation/transport actions.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Content-first responsive layout with non-occluding controls and shared navigation/transport actions.

### BIC-14 — Startup, bundle, interaction, idle-resource, and low-resource gates

- Kind: `performance`
- Depends on: `BIC-01, BIC-10, BIC-13`
- Atomic deliverable: Automate all hard budgets; fail closed with reproducible reports and no GPU requirement.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Automate all hard budgets; fail closed with reproducible reports and no GPU requirement.

### BIC-15 — Final accessibility, visual regression, flow coverage, and peer acceptance

- Kind: `evidence`
- Depends on: `BIC-02, BIC-03, BIC-04, BIC-05, BIC-06, BIC-07, BIC-08, BIC-09, BIC-11, BIC-12, BIC-13, BIC-14`
- Atomic deliverable: Produce complete evidence at four viewports and receive final advisory peer acceptance; repo gates remain authoritative.

Acceptance:
- Atomic scope only; no hidden adjacent redesign.
- Preserve CPU-first local operation and zero eager model/provider work.
- Include focused tests, fresh parent verification, and explicit performance-budget impact.
- Update affected canonical flow entries or prove no flow impact.
- Produce complete evidence at four viewports and receive final advisory peer acceptance; repo gates remain authoritative.
