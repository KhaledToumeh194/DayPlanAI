# DayPlan

DayPlan is a personal AI planning assistant. Describe what is on your plate and it suggests a practical plan for the local calendar day while keeping tasks, plan-item status, and plan history persistent.

The product principle is **DayPlan suggests; the user decides.** AI estimates and ordering are suggestions: users keep control of task status, priority, flexibility, due dates, estimates, and plan-item status. DayPlan does not monitor activity or complete work automatically.

## Stack

- Frontend: React, TypeScript, TanStack Router, Vite, and Tailwind CSS
- Backend: Node.js, Express, SQLite, and `better-sqlite3`
- AI: Gemini through the official `@google/genai` Node SDK
- Tests: Vitest, React Testing Library, Supertest, and Playwright

## Implemented behavior

### Tasks

- Create and delete tasks.
- Set priority, flexibility, due date, and an optional estimate.
- Mark tasks active, blocked, or completed.
- Filter tasks by status and persist changes in SQLite.

### Today

- Load the most recent saved plan for the backend's local calendar day.
- Generate a structured plan from natural-language input and relevant task context.
- Show active tasks and update task or plan-item status.
- Persist plan items with planned, completed, partial, skipped, moved, or blocked status.

### History

- Review recent plans, workload estimates, item statuses, and aggregate progress.
- Delete a plan after confirmation. Its plan items are removed, but linked Tasks are retained.

## AI planner

Planning/domain logic and provider-specific transport are separate:

- `backend/services/plannerService.js` builds and validates the planner contract.
- `backend/services/geminiAiProvider.js` calls Gemini through the Interactions API.
- `backend/services/aiService.js` defines provider-neutral error types.

The Gemini adapter uses `gemini-3.5-flash-lite` by default. Set `GEMINI_MODEL` to override the model without changing planning logic. Requests have a 30-second application timeout by default; `GEMINI_TIMEOUT_MS` accepts a value from 1 to 300,000 milliseconds. There is no production fake-planner fallback.

The request uses `store: false` and asks for strict structured JSON Schema output. DayPlan independently validates every response before writing anything. A malformed response returns a safe `502`; missing configuration or provider failure returns a safe `503`. Provider errors and internal details are not exposed in HTTP responses.

Plan persistence is atomic. Identical normalized input reuses the latest plan from the same local day, including a second duplicate check inside the write transaction. A generated item creates or reuses a non-completed Task only when `createsTask` is `true`; breaks and other non-task items remain plan items with no linked Task. Completed Tasks are not reused.

### Data sent to Gemini

The planner sends only:

- the user's current planning input;
- up to 100 active or blocked tasks; and
- each selected task's title, status, priority, due date, estimated minutes, and flexibility.

The complete serialized planning context, including input and JSON overhead, is limited to 16 KiB. Tasks are selected deterministically so overdue and near-term work, high priority, and blocked/active relevance are retained first.

It does not send completed tasks, full plan history, database IDs, task descriptions, unrelated timestamps, files, tools, or grounding data.

For a Gemini project/account governed by Romania/EEA terms, Google states that free-tier prompts and responses are not used for product improvement. `store: false` prevents storage as an Interaction object, but separate abuse-monitoring retention still applies: content may be retained for up to 55 days, and authorized reviewers may inspect content flagged as suspicious. Review the current [Gemini API terms](https://ai.google.dev/gemini-api/terms), [usage policies](https://ai.google.dev/gemini-api/docs/usage-policies), and project quota in Google AI Studio before using real data.

## Local development

Prerequisites: a current Node.js/npm installation and a Gemini API key.

Install dependencies:

```bash
npm install
npm --prefix backend install
```

Start the backend from the repository root, providing the credential through the environment only:

```bash
GEMINI_API_KEY="your-local-key" node backend/server.js
```

Optionally choose another compatible model:

```bash
GEMINI_API_KEY="your-local-key" GEMINI_MODEL="model-name" node backend/server.js
```

Optionally change the provider timeout:

```bash
GEMINI_API_KEY="your-local-key" GEMINI_TIMEOUT_MS=45000 node backend/server.js
```

Never add an API key to source control. The backend listens on port `3001` by default and uses `backend/dayplan.db`. `PORT` and `DAYPLAN_DATABASE_PATH` can override those defaults.

In another terminal, start the frontend:

```bash
npm run dev
```

The frontend defaults to `http://localhost:3001`. Set `VITE_API_URL` when the backend is elsewhere:

```bash
VITE_API_URL="http://127.0.0.1:3001" npm run dev
```

## Validation

Run the project checks from the repository root:

```bash
npm run test:frontend
npm --prefix backend test
npx tsc --noEmit
npm run build
npm run test:e2e
git diff --check
```

Backend tests use isolated in-memory or temporary databases and injected deterministic AI providers. The Playwright runner starts the real frontend and a dedicated backend with a temporary SQLite database, injects a deterministic provider, and refuses to use `backend/dayplan.db`. Tests therefore require no Gemini credential and do not call the live provider.

## Current limitations

- Live Gemini connectivity and account quota are not exercised by the automated suite.
- Plan items support status and estimate updates, but plans are not yet fully editable or reorderable in the UI.
