# smart-router — agent guide

OpenAI-compatible LLM proxy (Fastify + TypeScript ESM, Node 22). It exposes model
**aliases** as API models; each alias maps to an ordered list of upstream models
tried in order with fallback. A cron `timetable` enables/disables upstream models at
runtime. Config comes from `config.yaml` in the process CWD.

**Don't get wrong:** the client sends a *route alias*, not an upstream model name.
Fallback walks `route.models` in order and skips disabled models — see
`./agent-docs/routing.md`.

| You are working on… | Read |
| ------------------- | ---- |
| How a request is routed, fallback/overflow rules, adding an endpoint, auth | `./agent-docs/routing.md` |
| config.yaml fields, timetable events, env vars | `./agent-docs/configuration.md` |
| Build / dev / run / typecheck | `./agent-docs/commands.md` |
| Module boundaries and startup/request data flow | `./agent-docs/architecture.md` |
| Adding a file, import aliases, code style | `./agent-docs/conventions.md` |
| Prometheus metrics, dashboards, scrape config | `./agent-docs/observability.md` |

Always true:
- `config.yaml` is read from the process CWD at startup and is gitignored, so it must
  exist locally.
- Model enabled/disabled state is **in-memory only** — a restart re-enables every model.
- ESM only; relative imports use explicit `.ts` extensions. Aliases `#c/*`, `#t/*`,
  `#s/*` (see conventions).
- `dist/` and `config.yaml` are gitignored artifacts — never commit them.

No test or lint script is configured (see `./agent-docs/commands.md`).
