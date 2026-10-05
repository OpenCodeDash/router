# Routing, fallback & endpoints

When to read: changing request handling, fallback rules, auth, or adding an endpoint.

Server: Fastify in `src/router.ts`, 50 MB body limit, CORS `origin: true`.

## Endpoints

| Method | Path | Behavior |
| ------ | ---- | -------- |
| GET | `/health` | `{status:"ok"}`; no auth |
| GET | `/metrics` | Prometheus metrics; no auth (see `./observability.md`) |
| GET | `/v1/models` | Lists route aliases as OpenAI model objects |
| GET | `/v1/models/:id` | One alias, or 404 `model_not_found` |
| GET | `/v1/sessions/:id/route` | Last upstream model routed for an opencode session, or 404 `session_not_found` |
| POST | `/v1/chat/completions` | Proxy (see flow) |
| POST | `/v1/completions` | Proxy |
| POST | `/v1/embeddings` | Proxy |
| POST | `/v1/responses` | Proxy (Responses API, path `/responses`) |

Unknown paths → 404 `not_found`. All errors use the shape from `sendError` in
`src/util.ts`: `{ error: { message, type, param: null, code } }`.

## Auth

If `ROUTER_API_KEYS` is non-empty, an `onRequest` hook requires
`Authorization: Bearer <key>`. Exempt: `OPTIONS` requests, `/health`, `/metrics`, and
`/v1/sessions/*` (read-only, session-scoped, keyed by an opaque session id). A
missing/invalid key → 401 `invalid_api_key`. An empty key set disables auth (startup
warns).

## Proxy flow

1. Require `body.model` (the alias) → 400 `missing_model`; unknown alias → 404
   `model_not_found`.
2. Tie an `AbortController` to the client connection so a disconnect aborts upstream
   calls.
3. Resolve the session id (`resolveSessionId`): prefer `x-opencode-session-id`
   (opencode always sends it), then `x-opencode-session` (only `opencode*` providers),
   else sha256 of the first 2 messages, else a random UUID.
4. Build the upstream UA: `llm-router/<version> <client user-agent>`.
Request bodies are forwarded **verbatim** except `model`, which is replaced with
`model.upstreamModel`. There is no chat↔responses translation: a route used via
`/v1/responses` must list only upstream models that speak the Responses API, and the
client must send a Responses-format body.

5. For each id in `route.models`, **in order**:
   - skip if unknown (logged) or `enabled === false`;
   - `POST ${model.baseUrl}${path}` with body `{...body, model: model.upstreamModel}`
     and `Authorization` from `model.apiKeyEnv` when set;
   - network error → try next (an aborted client request returns immediately);
   - classify the response with the table below;
   - on success: record the chosen model for the session (`RouteTracker`, exposed via
     `GET /v1/sessions/:id/route`), set `x-router-model`, log `routed`, and stream the
     body. SSE responses also get `no-cache`, `keep-alive`, `x-accel-buffering: no`.
6. If no model succeeded, apply the exhaustion rule.

## Fallback decision

| Upstream status | Action |
| --------------- | ------ |
| 401, 403, 404, 408, 429, or ≥ 500 | fall back: record failure, try next |
| 400, 413, 422 **and** body matches context overflow | fall back (marked overflow), try next |
| 400, 413, 422 otherwise | pass the upstream error through immediately |
| anything else | success — stream it back |

Fallback statuses live in `src/const/fallback-statuses.const.ts`. Context-overflow
detection is the `CONTEXT_OVERFLOW_PATTERN` regex in `src/util.ts`.

## Exhaustion

When every model fell back: if the last failure was overflow, 429, or ≥ 500, pass that
upstream status/body through; otherwise return 502 `upstream_unavailable`.

Gotcha: a later *network-error* iteration clears `lastFailure`, so an earlier recorded
fallback failure is not passed through and the request ends as a 502.

## Runtime toggling

`disable-model` / `enable-model` timetable events (see `./configuration.md`) flip
`enabled` on `ModelManager`. Disabled models are skipped in the loop — they stay in the
route definition.

## Session route lookup

`RouteTracker` (`src/route-tracker.ts`) remembers, per opencode session id, the last
model that successfully served a request (`route`, config `model`, `upstreamModel`),
with a 15-minute TTL and a 5000-entry cap, evicting oldest-first. `GET
/v1/sessions/:id/route` returns that record or 404 `session_not_found`. Clients use it
to attribute cost after a fallback: opencode prices the alias it requested, not the
upstream that actually answered. State is in-memory only — a restart clears it. Lookups
are counted in `llmrouter_session_route_lookups_total{outcome}`.
