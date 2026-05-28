# Refactor Sanitization Ledger

## Cycle 2026-05-28 - Codebase Sanitization
- frontend/src/App.tsx:extract trailing utility helpers: done
- frontend/src/features/book-cinema/BookCinemaPanel.tsx:extract reusable upload/import helpers: done
- frontend/src/features/cinema/PreparedSourceCinemaBase.tsx:extract transport/player subcomponents: done
- frontend/src/features/settings/SettingsPanel.tsx:extract section components and state helpers — done
- backend/internal/pipeline/service.go:decompose generation orchestration functions — done
- backend/internal/pipeline/service_test.go:extract fixture builders and assertion helpers — done
- backend/internal/httpapi/router.go:split route registration helpers — done
- scripts/e2e-book-cinema.mjs:extract reusable e2e command helpers — done
- scripts/e2e-ui-action-audit.mjs:extract audit helpers and table builders — done
- backend/internal/pipeline/source_preps.go:extract source prep helpers — done
