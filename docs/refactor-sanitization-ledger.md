# Refactor Sanitization Ledger

## Cycle 2026-05-28 - Codebase Sanitization
- frontend/src/App.tsx:extract trailing utility helpers: done
- frontend/src/features/book-cinema/BookCinemaPanel.tsx:extract reusable upload/import helpers: done
- frontend/src/features/cinema/PreparedSourceCinemaBase.tsx:extract transport/player subcomponents — skipped-with-reason: not selected in first pass of cycle
- frontend/src/features/settings/SettingsPanel.tsx:extract section components and state helpers — skipped-with-reason: not selected in first pass of cycle
- backend/internal/pipeline/service.go:decompose generation orchestration functions — skipped-with-reason: not selected in first pass of cycle
- backend/internal/pipeline/service_test.go:extract fixture builders and assertion helpers — skipped-with-reason: not selected in first pass of cycle
- backend/internal/httpapi/router.go:split route registration helpers — skipped-with-reason: not selected in first pass of cycle
- scripts/e2e-book-cinema.mjs:extract reusable e2e command helpers — skipped-with-reason: not selected in first pass of cycle
- scripts/e2e-ui-action-audit.mjs:extract audit helpers and table builders — skipped-with-reason: not selected in first pass of cycle
