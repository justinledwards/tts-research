# Candidate application flows — Application Ux

Status: `candidate_pending_chatgpt`

Each diagram is architectural. Exact route/state ownership is gated by the proposed validator issue.

## APP-BOOT-001 — Application boot and local service readiness

Owner: `runtime`

```mermaid
%% flow-id: APP-BOOT-001
%% flow-version: 1
flowchart TD
  APP_BOOT_001_ENTRY["start command"] --> APP_BOOT_001_VALIDATE{"preconditions valid?"}
  APP_BOOT_001_VALIDATE -->|yes| APP_BOOT_001_WORK["perform bounded work"]
  APP_BOOT_001_WORK -->|success| APP_BOOT_001_SUCCESS["usable shell"]
  APP_BOOT_001_VALIDATE -->|no| APP_BOOT_001_FAIL["startup failure"]
  APP_BOOT_001_WORK -->|failure| APP_BOOT_001_FAIL
  APP_BOOT_001_WORK -->|cancel| APP_BOOT_001_CANCEL["cancel without hidden mutation"]
  APP_BOOT_001_FAIL --> APP_BOOT_001_RECOVER["retry with diagnostics"]
  APP_BOOT_001_RECOVER -->|retry| APP_BOOT_001_VALIDATE
  APP_BOOT_001_RECOVER -->|stop| APP_BOOT_001_BLOCKED["explicitly blocked with owner"]
```

## APP-FIRST-RUN-001 — First-run guided listen journey

Owner: `product-shell`

```mermaid
%% flow-id: APP-FIRST-RUN-001
%% flow-version: 1
flowchart TD
  APP_FIRST_RUN_001_ENTRY["first launch"] --> APP_FIRST_RUN_001_VALIDATE{"preconditions valid?"}
  APP_FIRST_RUN_001_VALIDATE -->|yes| APP_FIRST_RUN_001_WORK["perform bounded work"]
  APP_FIRST_RUN_001_WORK -->|success| APP_FIRST_RUN_001_SUCCESS["first playable source"]
  APP_FIRST_RUN_001_VALIDATE -->|no| APP_FIRST_RUN_001_FAIL["sample/import failure"]
  APP_FIRST_RUN_001_WORK -->|failure| APP_FIRST_RUN_001_FAIL
  APP_FIRST_RUN_001_WORK -->|cancel| APP_FIRST_RUN_001_CANCEL["cancel without hidden mutation"]
  APP_FIRST_RUN_001_FAIL --> APP_FIRST_RUN_001_RECOVER["return to intake"]
  APP_FIRST_RUN_001_RECOVER -->|retry| APP_FIRST_RUN_001_VALIDATE
  APP_FIRST_RUN_001_RECOVER -->|stop| APP_FIRST_RUN_001_BLOCKED["explicitly blocked with owner"]
```

## APP-NAV-001 — Application navigation and guarded workspace stages

Owner: `frontend-shell`

```mermaid
%% flow-id: APP-NAV-001
%% flow-version: 1
flowchart TD
  APP_NAV_001_ENTRY["restored or selected project"] --> APP_NAV_001_VALIDATE{"preconditions valid?"}
  APP_NAV_001_VALIDATE -->|yes| APP_NAV_001_WORK["perform bounded work"]
  APP_NAV_001_WORK -->|success| APP_NAV_001_SUCCESS["target surface"]
  APP_NAV_001_VALIDATE -->|no| APP_NAV_001_FAIL["invalid/stale context"]
  APP_NAV_001_WORK -->|failure| APP_NAV_001_FAIL
  APP_NAV_001_WORK -->|cancel| APP_NAV_001_CANCEL["cancel without hidden mutation"]
  APP_NAV_001_FAIL --> APP_NAV_001_RECOVER["safe library fallback"]
  APP_NAV_001_RECOVER -->|retry| APP_NAV_001_VALIDATE
  APP_NAV_001_RECOVER -->|stop| APP_NAV_001_BLOCKED["explicitly blocked with owner"]
```

## APP-COMMAND-001 — Command palette, shortcut, and visible-action parity

Owner: `frontend-shell`

```mermaid
%% flow-id: APP-COMMAND-001
%% flow-version: 1
flowchart TD
  APP_COMMAND_001_ENTRY["command intent"] --> APP_COMMAND_001_VALIDATE{"preconditions valid?"}
  APP_COMMAND_001_VALIDATE -->|yes| APP_COMMAND_001_WORK["perform bounded work"]
  APP_COMMAND_001_WORK -->|success| APP_COMMAND_001_SUCCESS["shared action completed"]
  APP_COMMAND_001_VALIDATE -->|no| APP_COMMAND_001_FAIL["disabled or invalid context"]
  APP_COMMAND_001_WORK -->|failure| APP_COMMAND_001_FAIL
  APP_COMMAND_001_WORK -->|cancel| APP_COMMAND_001_CANCEL["cancel without hidden mutation"]
  APP_COMMAND_001_FAIL --> APP_COMMAND_001_RECOVER["explain and retain focus"]
  APP_COMMAND_001_RECOVER -->|retry| APP_COMMAND_001_VALIDATE
  APP_COMMAND_001_RECOVER -->|stop| APP_COMMAND_001_BLOCKED["explicitly blocked with owner"]
```

## PRJ-LIFE-001 — Project create, open, rename, delete, and restore

Owner: `project-data`

```mermaid
%% flow-id: PRJ-LIFE-001
%% flow-version: 1
flowchart TD
  PRJ_LIFE_001_ENTRY["project intent"] --> PRJ_LIFE_001_VALIDATE{"preconditions valid?"}
  PRJ_LIFE_001_VALIDATE -->|yes| PRJ_LIFE_001_WORK["perform bounded work"]
  PRJ_LIFE_001_WORK -->|success| PRJ_LIFE_001_SUCCESS["durable active project"]
  PRJ_LIFE_001_VALIDATE -->|no| PRJ_LIFE_001_FAIL["validation or persistence failure"]
  PRJ_LIFE_001_WORK -->|failure| PRJ_LIFE_001_FAIL
  PRJ_LIFE_001_WORK -->|cancel| PRJ_LIFE_001_CANCEL["cancel without hidden mutation"]
  PRJ_LIFE_001_FAIL --> PRJ_LIFE_001_RECOVER["restore prior selection"]
  PRJ_LIFE_001_RECOVER -->|retry| PRJ_LIFE_001_VALIDATE
  PRJ_LIFE_001_RECOVER -->|stop| PRJ_LIFE_001_BLOCKED["explicitly blocked with owner"]
```

## SRC-DURABLE-001 — Durable file/paste/document intake

Owner: `source-ingestion`

```mermaid
%% flow-id: SRC-DURABLE-001
%% flow-version: 1
flowchart TD
  SRC_DURABLE_001_ENTRY["source input"] --> SRC_DURABLE_001_VALIDATE{"preconditions valid?"}
  SRC_DURABLE_001_VALIDATE -->|yes| SRC_DURABLE_001_WORK["perform bounded work"]
  SRC_DURABLE_001_WORK -->|success| SRC_DURABLE_001_SUCCESS["reviewable durable source"]
  SRC_DURABLE_001_VALIDATE -->|no| SRC_DURABLE_001_FAIL["extract or readiness failure"]
  SRC_DURABLE_001_WORK -->|failure| SRC_DURABLE_001_FAIL
  SRC_DURABLE_001_WORK -->|cancel| SRC_DURABLE_001_CANCEL["cancel without hidden mutation"]
  SRC_DURABLE_001_FAIL --> SRC_DURABLE_001_RECOVER["repair or retry intake"]
  SRC_DURABLE_001_RECOVER -->|retry| SRC_DURABLE_001_VALIDATE
  SRC_DURABLE_001_RECOVER -->|stop| SRC_DURABLE_001_BLOCKED["explicitly blocked with owner"]
```

## SRC-URL-001 — URL safety, fetch, redirect, and extraction

Owner: `source-security`

```mermaid
%% flow-id: SRC-URL-001
%% flow-version: 1
flowchart TD
  SRC_URL_001_ENTRY["URL input"] --> SRC_URL_001_VALIDATE{"preconditions valid?"}
  SRC_URL_001_VALIDATE -->|yes| SRC_URL_001_WORK["perform bounded work"]
  SRC_URL_001_WORK -->|success| SRC_URL_001_SUCCESS["reviewable local source"]
  SRC_URL_001_VALIDATE -->|no| SRC_URL_001_FAIL["unsafe network target or fetch failure"]
  SRC_URL_001_WORK -->|failure| SRC_URL_001_FAIL
  SRC_URL_001_WORK -->|cancel| SRC_URL_001_CANCEL["cancel without hidden mutation"]
  SRC_URL_001_FAIL --> SRC_URL_001_RECOVER["reject or retry safe URL"]
  SRC_URL_001_RECOVER -->|retry| SRC_URL_001_VALIDATE
  SRC_URL_001_RECOVER -->|stop| SRC_URL_001_BLOCKED["explicitly blocked with owner"]
```

## SRC-TEMP-001 — Quick Listen temporary source lifecycle

Owner: `source-ingestion`

```mermaid
%% flow-id: SRC-TEMP-001
%% flow-version: 1
flowchart TD
  SRC_TEMP_001_ENTRY["ephemeral input"] --> SRC_TEMP_001_VALIDATE{"preconditions valid?"}
  SRC_TEMP_001_VALIDATE -->|yes| SRC_TEMP_001_WORK["perform bounded work"]
  SRC_TEMP_001_WORK -->|success| SRC_TEMP_001_SUCCESS["temporary playable session"]
  SRC_TEMP_001_VALIDATE -->|no| SRC_TEMP_001_FAIL["import, expiry, or discard"]
  SRC_TEMP_001_WORK -->|failure| SRC_TEMP_001_FAIL
  SRC_TEMP_001_WORK -->|cancel| SRC_TEMP_001_CANCEL["cancel without hidden mutation"]
  SRC_TEMP_001_FAIL --> SRC_TEMP_001_RECOVER["retry or promote"]
  SRC_TEMP_001_RECOVER -->|retry| SRC_TEMP_001_VALIDATE
  SRC_TEMP_001_RECOVER -->|stop| SRC_TEMP_001_BLOCKED["explicitly blocked with owner"]
```

## SRC-PROMOTE-001 — Temporary-to-durable promotion

Owner: `source-project-data`

```mermaid
%% flow-id: SRC-PROMOTE-001
%% flow-version: 1
flowchart TD
  SRC_PROMOTE_001_ENTRY["temporary source"] --> SRC_PROMOTE_001_VALIDATE{"preconditions valid?"}
  SRC_PROMOTE_001_VALIDATE -->|yes| SRC_PROMOTE_001_WORK["perform bounded work"]
  SRC_PROMOTE_001_WORK -->|success| SRC_PROMOTE_001_SUCCESS["durable source with crosswalk"]
  SRC_PROMOTE_001_VALIDATE -->|no| SRC_PROMOTE_001_FAIL["conflict or partial copy"]
  SRC_PROMOTE_001_WORK -->|failure| SRC_PROMOTE_001_FAIL
  SRC_PROMOTE_001_WORK -->|cancel| SRC_PROMOTE_001_CANCEL["cancel without hidden mutation"]
  SRC_PROMOTE_001_FAIL --> SRC_PROMOTE_001_RECOVER["rollback and retry"]
  SRC_PROMOTE_001_RECOVER -->|retry| SRC_PROMOTE_001_VALIDATE
  SRC_PROMOTE_001_RECOVER -->|stop| SRC_PROMOTE_001_BLOCKED["explicitly blocked with owner"]
```

## SRC-REVIEW-001 — Source review, scope, and readiness

Owner: `workspace-review`

```mermaid
%% flow-id: SRC-REVIEW-001
%% flow-version: 1
flowchart TD
  SRC_REVIEW_001_ENTRY["reviewable source"] --> SRC_REVIEW_001_VALIDATE{"preconditions valid?"}
  SRC_REVIEW_001_VALIDATE -->|yes| SRC_REVIEW_001_WORK["perform bounded work"]
  SRC_REVIEW_001_WORK -->|success| SRC_REVIEW_001_SUCCESS["approved narratable scope"]
  SRC_REVIEW_001_VALIDATE -->|no| SRC_REVIEW_001_FAIL["stale or blocked content"]
  SRC_REVIEW_001_WORK -->|failure| SRC_REVIEW_001_FAIL
  SRC_REVIEW_001_WORK -->|cancel| SRC_REVIEW_001_CANCEL["cancel without hidden mutation"]
  SRC_REVIEW_001_FAIL --> SRC_REVIEW_001_RECOVER["repair or return to intake"]
  SRC_REVIEW_001_RECOVER -->|retry| SRC_REVIEW_001_VALIDATE
  SRC_REVIEW_001_RECOVER -->|stop| SRC_REVIEW_001_BLOCKED["explicitly blocked with owner"]
```

## POLICY-RESOLVE-001 — Speech policy precedence and effective plan

Owner: `speech-policy`

```mermaid
%% flow-id: POLICY-RESOLVE-001
%% flow-version: 1
flowchart TD
  POLICY_RESOLVE_001_ENTRY["scope settings"] --> POLICY_RESOLVE_001_VALIDATE{"preconditions valid?"}
  POLICY_RESOLVE_001_VALIDATE -->|yes| POLICY_RESOLVE_001_WORK["perform bounded work"]
  POLICY_RESOLVE_001_WORK -->|success| POLICY_RESOLVE_001_SUCCESS["effective speech plan"]
  POLICY_RESOLVE_001_VALIDATE -->|no| POLICY_RESOLVE_001_FAIL["invalid or unavailable profile"]
  POLICY_RESOLVE_001_WORK -->|failure| POLICY_RESOLVE_001_FAIL
  POLICY_RESOLVE_001_WORK -->|cancel| POLICY_RESOLVE_001_CANCEL["cancel without hidden mutation"]
  POLICY_RESOLVE_001_FAIL --> POLICY_RESOLVE_001_RECOVER["fallback with explanation"]
  POLICY_RESOLVE_001_RECOVER -->|retry| POLICY_RESOLVE_001_VALIDATE
  POLICY_RESOLVE_001_RECOVER -->|stop| POLICY_RESOLVE_001_BLOCKED["explicitly blocked with owner"]
```

## PREVIEW-001 — Voice preview and audition

Owner: `preview-audio`

```mermaid
%% flow-id: PREVIEW-001
%% flow-version: 1
flowchart TD
  PREVIEW_001_ENTRY["review scope"] --> PREVIEW_001_VALIDATE{"preconditions valid?"}
  PREVIEW_001_VALIDATE -->|yes| PREVIEW_001_WORK["perform bounded work"]
  PREVIEW_001_WORK -->|success| PREVIEW_001_SUCCESS["approved preview configuration"]
  PREVIEW_001_VALIDATE -->|no| PREVIEW_001_FAIL["engine or preview failure"]
  PREVIEW_001_WORK -->|failure| PREVIEW_001_FAIL
  PREVIEW_001_WORK -->|cancel| PREVIEW_001_CANCEL["cancel without hidden mutation"]
  PREVIEW_001_FAIL --> PREVIEW_001_RECOVER["change voice or retry"]
  PREVIEW_001_RECOVER -->|retry| PREVIEW_001_VALIDATE
  PREVIEW_001_RECOVER -->|stop| PREVIEW_001_BLOCKED["explicitly blocked with owner"]
```

## TELEPROMPT-001 — Teleprompt entry, theatre handoff, and return

Owner: `reader-teleprompt`

```mermaid
%% flow-id: TELEPROMPT-001
%% flow-version: 1
flowchart TD
  TELEPROMPT_001_ENTRY["review or preview"] --> TELEPROMPT_001_VALIDATE{"preconditions valid?"}
  TELEPROMPT_001_VALIDATE -->|yes| TELEPROMPT_001_WORK["perform bounded work"]
  TELEPROMPT_001_WORK -->|success| TELEPROMPT_001_SUCCESS["safe return target"]
  TELEPROMPT_001_VALIDATE -->|no| TELEPROMPT_001_FAIL["audio/fullscreen/context failure"]
  TELEPROMPT_001_WORK -->|failure| TELEPROMPT_001_FAIL
  TELEPROMPT_001_WORK -->|cancel| TELEPROMPT_001_CANCEL["cancel without hidden mutation"]
  TELEPROMPT_001_FAIL --> TELEPROMPT_001_RECOVER["degraded reading or return"]
  TELEPROMPT_001_RECOVER -->|retry| TELEPROMPT_001_VALIDATE
  TELEPROMPT_001_RECOVER -->|stop| TELEPROMPT_001_BLOCKED["explicitly blocked with owner"]
```
