# Configuration & environment

When to read: editing `config.yaml`, adding a model/route/timetable field, or changing
env vars.

## config.yaml

Read from the process CWD by `src/config.ts` and validated with Zod schemas in
`src/schema/`. Invalid YAML or schema throws and aborts startup (with a prettified Zod
error). See `README.md` for a full example.

| Key | Type | Notes |
| --- | ---- | ----- |
| `models` | record `id → Model` | Upstream providers |
| `routes` | record `alias → Route` | Client-facing model names |
| `timetable` | `CronEvent[]` (optional) | Cron-driven model toggles |

`Model` (`src/schema/model.schema.ts`):

| Field | Type | Notes |
| ----- | ---- | ----- |
| `baseUrl` | URL | Base for the OpenAI-compatible upstream (e.g. `…/v1`) |
| `upstreamModel` | string | Model name sent upstream |
| `apiKeyEnv` | string (optional) | Env var holding the upstream bearer token |

`Route` (`src/schema/route.schema.ts`): `models: string[]` (non-empty) — upstream model
ids tried in order.

`CronEvent` (`src/schema/cron-event.schema.ts`): `cron` (validated with `isValidCron` —
a real `Cron` parse) plus `event`.

`Event` (`src/schema/event/`) is a union:

- `{ type: "enable-model", model: string }`
- `{ type: "disable-model", model: string }`

## Environment

| Var | Default | Purpose |
| --- | ------- | ------- |
| `ROUTER_API_KEYS` | (empty) | Comma-separated proxy keys; empty disables auth |
| `HOST` | `0.0.0.0` | Listen host |
| `PORT` | `3000` | Listen port |
| `<model.apiKeyEnv>` | — | Upstream bearer token, read per model at request time |

Loaded via `dotenv` from `.env` (gitignored).

## Files & secrets

- `config.yaml` — gitignored; must be provided locally.
- `.env` — gitignored; sample only sets `ROUTER_API_KEYS`.
- Never commit real keys.

## Reference integrity

References are not fully validated at startup:

- A route listing a nonexistent model id is logged and skipped at request time.
- A timetable event naming a nonexistent model throws when the cron fires; the
  `TimetableManager` cron `catch` logs it.
