# Implementation Plans

Generated 2026-07-18. Read the selected plan fully before implementation and honor its STOP conditions.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Harden local model lifecycle | P1 | L | — | Complete |

## Findings considered and deferred

- Repeated `start()` requests can advance the dictation generation while an existing capture is active. This is a separate shortcut/lifecycle edge case and is not part of the model-runtime hardening plan.
