# Agent Instructions

## Working Log

- Before starting a new piece of work, append a concise timestamped section to `WORKINGLOG.md`.
- Use this heading format: `## YYYY-MM-DD HH:mm ZZZ - Work Name`.
- Under that heading, add tasks as Markdown checkboxes: `- [ ] taskname`.
- Check tasks off as progress is made: `- [x] taskname`.
- Add new checkbox tasks under the active section whenever more work is discovered.
- Keep entries concise and factual. The log should show what changed and what remains without duplicating implementation details from commits.

## Project Notes

- Backend code lives in `backend/` and uses Go Fiber.
- Frontend code lives in `frontend/` and uses Vite, React, Tailwind, and strict TypeScript.
- Root JavaScript tooling is managed with `pnpm`.
- Go and Node versions are pinned in `mise.toml`.
- Run project checks before handing work back.
