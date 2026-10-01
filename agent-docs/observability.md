# Observability (Prometheus metrics)

When to read: adding or changing metrics, configuring a scrape target, or debugging
dashboards/alerts.

The server exposes `GET /metrics` in Prometheus text format via `prom-client`
(`src/metrics.ts`). The route is auth-exempt (like `/health`) because Prometheus
cannot send the router bearer key — restrict access by network instead. Every app
metric is prefixed `llmrouter_`.

## Runtime (free, `collectDefaultMetrics`)

`llmrouter_process_*` (CPU, RSS, fds, start time) and `llmrouter_nodejs_*` (heap, GC,
event-loop lag, active handles/requests, version).

## HTTP (all endpoints)

| Metric | Type | Labels |
| ------ | ---- | ------ |
| `llmrouter_http_requests_total` | counter | `method`, `route`, `status_code` |
| `llmrouter_http_request_duration_seconds` | histogram | `method`, `route`, `status_code` |
| `llmrouter_http_requests_in_progress` | gauge | `method` |

`route` is the Fastify route **pattern** (`req.routeOptions.url`), or `unmatched` for
404s — never the raw URL.

## Routing / fallback

Counters are **per attempt**, so one request can increment several.

| Metric | Type | Labels | Meaning |
| ------ | ---- | ------ | ------- |
| `llmrouter_route_requests_total` | counter | `route`, `model`, `outcome` (`success`/`fallback`) | Per-model attempt result |
| `llmrouter_upstream_requests_total` | counter | `route`, `model`, `status` (`0` = network error) | Every upstream call |
| `llmrouter_upstream_duration_seconds` | histogram | `route`, `model` | Time-to-headers (seconds) |
| `llmrouter_upstream_in_flight` | gauge | `model` | Upstream calls in flight |
| `llmrouter_fallbacks_total` | counter | `route`, `model`, `reason` (`status`/`overflow`/`network`) | Why we moved on |
| `llmrouter_context_overflow_total` | counter | `model` | Context-overflow fallbacks |
| `llmrouter_passthrough_total` | counter | `route`, `model`, `status` | Upstream error passed through on exhaustion |
| `llmrouter_exhausted_total` | counter | `route` | No model succeeded → 502 |

Request-level exhaustion is tracked by `exhausted_total`, not by a `route_requests_total`
outcome, because it has no single model.

## State / timetable / auth

| Metric | Type | Labels |
| ------ | ---- | ------ |
| `llmrouter_model_enabled` | gauge 0/1 | `model` |
| `llmrouter_timetable_events_total` | counter | `type`, `model` |
| `llmrouter_timetable_event_errors_total` | counter | `type` |
| `llmrouter_auth_failures_total` | counter | — |

## Where it is emitted

- Definitions + registry: `src/metrics.ts`.
- HTTP hooks, `/metrics` route, auth-failure counter, and all routing counters:
  `src/router.ts` (hooks at the top of the `app.register` callback; proxy branches in
  `proxy`).
- `llmrouter_model_enabled`: `src/model-manager.ts` (init + `setModelEnabled`).
- Timetable counters: `src/event-manager.ts`, `src/timetable-manager.ts`.

## Labels & cardinality

Only bounded labels: route alias, model id, HTTP status, and small enums. Never label by
session id, request id, raw URL, user agent, or API key.

## Scrape

Nothing is collected until a Prometheus job targets the router's `host:port`. Since the
endpoint is unauthenticated, expose it only on an internal network. Match the in-house
label scheme (`app`, `env`, `instance`).

## Not available

Token counts / cost (upstream `usage` is absent from streamed responses), per-user or
per-session breakdown, and true streaming generation time (only time-to-headers is
measured).
