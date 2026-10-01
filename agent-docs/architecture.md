# Architecture

When to read: understanding module boundaries or where startup / request flow lives.

A Fastify server (`src/router.ts`) proxies OpenAI-style requests to upstream
providers selected by config-driven routes. Three managers hold runtime state:
models, events, and the timetable.

## Modules

| Area | Where | Responsibility |
| ---- | ----- | -------------- |
| Entry / wiring | `src/main.ts` | Load env + config, construct managers, register crons, start Router |
| Config | `src/config.ts`, `src/schema/` | Read and Zod-validate `config.yaml` |
| Models | `src/model-manager.ts` | In-memory model registry + `enabled` flag |
| Events | `src/event-manager.ts` | Apply enable/disable-model events to ModelManager |
| Timetable | `src/timetable-manager.ts` | Croner jobs that fire events |
| HTTP | `src/router.ts` | Fastify app, auth hook, OpenAI endpoints, proxy + fallback loop |
| Helpers | `src/util.ts` | Error shape, fallback/overflow predicates, session/UA headers |
| Metrics | `src/metrics.ts` | `prom-client` registry + metric definitions (`/metrics`) |
| Constants | `src/const/` | Fallback statuses, user-agent, version |
| Types | `src/type/` | `LoadedModel`, `UpstreamFailure` |

## Data flow

Startup (`src/main.ts`):

1. `getConfig()` reads and validates `config.yaml`.
2. `ModelManager(config.models)` loads every model with `enabled: true`.
3. `EventManager` wraps the model manager; `TimetableManager` registers each
   `config.timetable` entry as a cron job.
4. `Router` starts Fastify. Its `onClose` hook calls `timetableManager.destroy()`.

Request: `POST /v1/{chat/completions,completions,embeddings}` → auth hook → resolve
alias to route → loop `route.models` → `fetch` upstream → stream response or fall
back. Detail in `./routing.md`.

## Invariants

- Model `enabled` state lives only in `ModelManager`; nothing persists it.
- The Router and the timetable mutate the **same** `ModelManager` instance.
- Config is validated once at startup; an invalid config exits the process.
