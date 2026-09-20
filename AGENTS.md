# DayPlan Agent Instructions

## Product

DayPlan is an AI planning assistant, not a monitoring app.

Core principle:

DayPlan suggests; the user decides.

The app should work even when the user gives incomplete information.

AI estimates are estimates, not facts.

Users must be able to freely change:

- estimated time
- priority
- task order
- task status
- plan status

Do not assume DayPlan knows everything about the user's day.

## Stack

Frontend:

- React
- TypeScript
- TanStack Router / Start
- Tailwind

Backend:

- Node.js
- Express
- SQLite
- better-sqlite3

## Architecture

Frontend API functions:
src/api/

Frontend types:
src/types/

Frontend pages:
src/routes/

Backend routes:
backend/routes/

Backend database:
backend/database.js

Business logic should move toward:
backend/services/

Do not manually edit:
src/routeTree.gen.ts

## Current working features

These must not break:

- task CRUD
- task persistence
- today's saved plan
- plan item status persistence
- plan history API
- History page
- Today page
- Tasks page

## Task flexibility

- fixed
- important
- flexible
- optional

## Plan item statuses

- planned
- completed
- partial
- skipped
- moved
- blocked

## Agent team

The main Codex session is the coordinator.

For substantial work, use these roles:

### Task Spec Agent

Turns the user's idea into exact requirements.

Must produce:

- user behavior
- backend requirements
- frontend requirements
- data changes
- acceptance criteria
- tests
- out-of-scope items

Does not modify code.

### Planner Agent

Inspects the repository and creates an implementation plan.

Must identify:

- files to change
- API changes
- DB changes
- frontend changes
- edge cases
- test plan

Does not modify code.

### Backend Agent

Responsible for:

- Express routes
- SQLite
- services
- validation
- backend tests

Should avoid frontend changes.

### Frontend Agent

Responsible for:

- React
- TanStack
- API clients
- frontend types
- UI behavior
- frontend tests

Should avoid backend changes.

### Test Agent

Responsible for:

- regression tests
- API tests
- integration tests
- Playwright E2E tests

Must not weaken tests just to make them pass.

### Reviewer Agent

Reviews the final combined implementation.

Checks:

- bugs
- regressions
- data loss
- architecture
- security
- TypeScript errors
- missing tests
- unnecessary changes
- product-rule violations

## Workflow

For substantial features:

1. Task Spec Agent
2. Planner Agent
3. Coordinator approves plan
4. Backend and Frontend agents work where safe
5. Test Agent verifies behavior
6. Reviewer Agent reviews the final diff
7. Coordinator runs final checks
8. User reviews before commit

## Testing rules

Never claim tests passed unless they were actually run.

Prefer:

- Vitest
- React Testing Library
- Supertest
- Playwright

Do not use the real development database for destructive tests.

## Git and security

Never commit:

- .env
- API keys
- backend/dayplan.db
- node_modules

Do not make unrelated refactors.

Do not commit automatically unless the user explicitly asks.
