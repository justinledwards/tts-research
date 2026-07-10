# Candidate application flows — Runtime Data Security

Status: `candidate_pending_chatgpt`

Each diagram is architectural. Exact route/state ownership is gated by the proposed validator issue.

## EXPORT-BUNDLE-001 — Project export bundle

Owner: `data-portability`

```mermaid
%% flow-id: EXPORT-BUNDLE-001
%% flow-version: 1
flowchart TD
  EXPORT_BUNDLE_001_ENTRY["export intent"] --> EXPORT_BUNDLE_001_VALIDATE{"preconditions valid?"}
  EXPORT_BUNDLE_001_VALIDATE -->|yes| EXPORT_BUNDLE_001_WORK["perform bounded work"]
  EXPORT_BUNDLE_001_WORK -->|success| EXPORT_BUNDLE_001_SUCCESS["verified downloadable ZIP"]
  EXPORT_BUNDLE_001_VALIDATE -->|no| EXPORT_BUNDLE_001_FAIL["missing/read/hash/zip failure"]
  EXPORT_BUNDLE_001_WORK -->|failure| EXPORT_BUNDLE_001_FAIL
  EXPORT_BUNDLE_001_WORK -->|cancel| EXPORT_BUNDLE_001_CANCEL["cancel without hidden mutation"]
  EXPORT_BUNDLE_001_FAIL --> EXPORT_BUNDLE_001_RECOVER["warn or retry"]
  EXPORT_BUNDLE_001_RECOVER -->|retry| EXPORT_BUNDLE_001_VALIDATE
  EXPORT_BUNDLE_001_RECOVER -->|stop| EXPORT_BUNDLE_001_BLOCKED["explicitly blocked with owner"]
```

## IMPORT-BUNDLE-001 — Project bundle preview and transactional import

Owner: `data-portability`

```mermaid
%% flow-id: IMPORT-BUNDLE-001
%% flow-version: 1
flowchart TD
  IMPORT_BUNDLE_001_ENTRY["bundle upload"] --> IMPORT_BUNDLE_001_VALIDATE{"preconditions valid?"}
  IMPORT_BUNDLE_001_VALIDATE -->|yes| IMPORT_BUNDLE_001_WORK["perform bounded work"]
  IMPORT_BUNDLE_001_WORK -->|success| IMPORT_BUNDLE_001_SUCCESS["committed project state"]
  IMPORT_BUNDLE_001_VALIDATE -->|no| IMPORT_BUNDLE_001_FAIL["version/hash/conflict/copy failure"]
  IMPORT_BUNDLE_001_WORK -->|failure| IMPORT_BUNDLE_001_FAIL
  IMPORT_BUNDLE_001_WORK -->|cancel| IMPORT_BUNDLE_001_CANCEL["cancel without hidden mutation"]
  IMPORT_BUNDLE_001_FAIL --> IMPORT_BUNDLE_001_RECOVER["rollback and resolve"]
  IMPORT_BUNDLE_001_RECOVER -->|retry| IMPORT_BUNDLE_001_VALIDATE
  IMPORT_BUNDLE_001_RECOVER -->|stop| IMPORT_BUNDLE_001_BLOCKED["explicitly blocked with owner"]
```

## UI-MEMORY-001 — UI memory, pruning, and restoration

Owner: `frontend-data`

```mermaid
%% flow-id: UI-MEMORY-001
%% flow-version: 1
flowchart TD
  UI_MEMORY_001_ENTRY["remembered context"] --> UI_MEMORY_001_VALIDATE{"preconditions valid?"}
  UI_MEMORY_001_VALIDATE -->|yes| UI_MEMORY_001_WORK["perform bounded work"]
  UI_MEMORY_001_WORK -->|success| UI_MEMORY_001_SUCCESS["valid restored surface"]
  UI_MEMORY_001_VALIDATE -->|no| UI_MEMORY_001_FAIL["missing/expired context"]
  UI_MEMORY_001_WORK -->|failure| UI_MEMORY_001_FAIL
  UI_MEMORY_001_WORK -->|cancel| UI_MEMORY_001_CANCEL["cancel without hidden mutation"]
  UI_MEMORY_001_FAIL --> UI_MEMORY_001_RECOVER["prune and safe fallback"]
  UI_MEMORY_001_RECOVER -->|retry| UI_MEMORY_001_VALIDATE
  UI_MEMORY_001_RECOVER -->|stop| UI_MEMORY_001_BLOCKED["explicitly blocked with owner"]
```

## SETTINGS-001 — Settings scope, capability, import, and reset

Owner: `frontend-runtime`

```mermaid
%% flow-id: SETTINGS-001
%% flow-version: 1
flowchart TD
  SETTINGS_001_ENTRY["setting intent"] --> SETTINGS_001_VALIDATE{"preconditions valid?"}
  SETTINGS_001_VALIDATE -->|yes| SETTINGS_001_WORK["perform bounded work"]
  SETTINGS_001_WORK -->|success| SETTINGS_001_SUCCESS["effective persisted value"]
  SETTINGS_001_VALIDATE -->|no| SETTINGS_001_FAIL["invalid/unavailable/storage failure"]
  SETTINGS_001_WORK -->|failure| SETTINGS_001_FAIL
  SETTINGS_001_WORK -->|cancel| SETTINGS_001_CANCEL["cancel without hidden mutation"]
  SETTINGS_001_FAIL --> SETTINGS_001_RECOVER["explain, revert, or reset"]
  SETTINGS_001_RECOVER -->|retry| SETTINGS_001_VALIDATE
  SETTINGS_001_RECOVER -->|stop| SETTINGS_001_BLOCKED["explicitly blocked with owner"]
```

## ERROR-RECOVERY-001 — Operational error routing and recovery ownership

Owner: `cross-functional`

```mermaid
%% flow-id: ERROR-RECOVERY-001
%% flow-version: 1
flowchart TD
  ERROR_RECOVERY_001_ENTRY["surfaced operational issue"] --> ERROR_RECOVERY_001_VALIDATE{"preconditions valid?"}
  ERROR_RECOVERY_001_VALIDATE -->|yes| ERROR_RECOVERY_001_WORK["perform bounded work"]
  ERROR_RECOVERY_001_WORK -->|success| ERROR_RECOVERY_001_SUCCESS["resolved or explicitly blocked state"]
  ERROR_RECOVERY_001_VALIDATE -->|no| ERROR_RECOVERY_001_FAIL["repeated or unavailable recovery"]
  ERROR_RECOVERY_001_WORK -->|failure| ERROR_RECOVERY_001_FAIL
  ERROR_RECOVERY_001_WORK -->|cancel| ERROR_RECOVERY_001_CANCEL["cancel without hidden mutation"]
  ERROR_RECOVERY_001_FAIL --> ERROR_RECOVERY_001_RECOVER["escalate diagnostics"]
  ERROR_RECOVERY_001_RECOVER -->|retry| ERROR_RECOVERY_001_VALIDATE
  ERROR_RECOVERY_001_RECOVER -->|stop| ERROR_RECOVERY_001_BLOCKED["explicitly blocked with owner"]
```

## BOUNDARY-001 — Local, filesystem, subprocess, URL, and provider boundaries

Owner: `runtime-security`

```mermaid
%% flow-id: BOUNDARY-001
%% flow-version: 1
flowchart TD
  BOUNDARY_001_ENTRY["data or command crossing"] --> BOUNDARY_001_VALIDATE{"preconditions valid?"}
  BOUNDARY_001_VALIDATE -->|yes| BOUNDARY_001_WORK["perform bounded work"]
  BOUNDARY_001_WORK -->|success| BOUNDARY_001_SUCCESS["authorized classified result"]
  BOUNDARY_001_VALIDATE -->|no| BOUNDARY_001_FAIL["origin/auth/egress/process failure"]
  BOUNDARY_001_WORK -->|failure| BOUNDARY_001_FAIL
  BOUNDARY_001_WORK -->|cancel| BOUNDARY_001_CANCEL["cancel without hidden mutation"]
  BOUNDARY_001_FAIL --> BOUNDARY_001_RECOVER["reject or local fallback"]
  BOUNDARY_001_RECOVER -->|retry| BOUNDARY_001_VALIDATE
  BOUNDARY_001_RECOVER -->|stop| BOUNDARY_001_BLOCKED["explicitly blocked with owner"]
```

## DIAGNOSTICS-001 — Health, capability, and setup diagnostics

Owner: `runtime-platform`

```mermaid
%% flow-id: DIAGNOSTICS-001
%% flow-version: 1
flowchart TD
  DIAGNOSTICS_001_ENTRY["capability check"] --> DIAGNOSTICS_001_VALIDATE{"preconditions valid?"}
  DIAGNOSTICS_001_VALIDATE -->|yes| DIAGNOSTICS_001_WORK["perform bounded work"]
  DIAGNOSTICS_001_WORK -->|success| DIAGNOSTICS_001_SUCCESS["ready capability"]
  DIAGNOSTICS_001_VALIDATE -->|no| DIAGNOSTICS_001_FAIL["tool/model/token/setup failure"]
  DIAGNOSTICS_001_WORK -->|failure| DIAGNOSTICS_001_FAIL
  DIAGNOSTICS_001_WORK -->|cancel| DIAGNOSTICS_001_CANCEL["cancel without hidden mutation"]
  DIAGNOSTICS_001_FAIL --> DIAGNOSTICS_001_RECOVER["actionable setup or degraded mode"]
  DIAGNOSTICS_001_RECOVER -->|retry| DIAGNOSTICS_001_VALIDATE
  DIAGNOSTICS_001_RECOVER -->|stop| DIAGNOSTICS_001_BLOCKED["explicitly blocked with owner"]
```
