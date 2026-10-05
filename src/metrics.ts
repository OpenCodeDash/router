import {
	collectDefaultMetrics,
	Counter,
	Gauge,
	Histogram,
	Registry,
} from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: "llmrouter_" });

const LATENCY_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300];

export const httpRequestsTotal = new Counter({
	name: "llmrouter_http_requests_total",
	help: "Total HTTP requests handled, by method, route and status code.",
	labelNames: ["method", "route", "status_code"] as const,
	registers: [registry],
});

export const httpRequestDuration = new Histogram({
	name: "llmrouter_http_request_duration_seconds",
	help: "HTTP request duration in seconds, by method, route and status code.",
	labelNames: ["method", "route", "status_code"] as const,
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
	registers: [registry],
});

export const httpRequestsInProgress = new Gauge({
	name: "llmrouter_http_requests_in_progress",
	help: "HTTP requests currently in progress, by method.",
	labelNames: ["method"] as const,
	registers: [registry],
});

export const upstreamRequestsTotal = new Counter({
	name: "llmrouter_upstream_requests_total",
	help: "Upstream attempts, by route, model and upstream HTTP status (0 = network error).",
	labelNames: ["route", "model", "status"] as const,
	registers: [registry],
});

export const upstreamDuration = new Histogram({
	name: "llmrouter_upstream_duration_seconds",
	help: "Upstream time-to-headers in seconds, by route and model.",
	labelNames: ["route", "model"] as const,
	buckets: LATENCY_BUCKETS,
	registers: [registry],
});

export const upstreamInFlight = new Gauge({
	name: "llmrouter_upstream_in_flight",
	help: "Upstream requests currently in flight, by model.",
	labelNames: ["model"] as const,
	registers: [registry],
});

export const routeRequestsTotal = new Counter({
	name: "llmrouter_route_requests_total",
	help: "Per-model route attempts, by route, model and outcome.",
	labelNames: ["route", "model", "outcome"] as const,
	registers: [registry],
});

export const fallbacksTotal = new Counter({
	name: "llmrouter_fallbacks_total",
	help: "Fallbacks to the next model, by route, model and reason.",
	labelNames: ["route", "model", "reason"] as const,
	registers: [registry],
});

export const contextOverflowTotal = new Counter({
	name: "llmrouter_context_overflow_total",
	help: "Context-overflow fallbacks, by model.",
	labelNames: ["model"] as const,
	registers: [registry],
});

export const passthroughTotal = new Counter({
	name: "llmrouter_passthrough_total",
	help: "Upstream errors passed through on exhaustion, by route, model and status.",
	labelNames: ["route", "model", "status"] as const,
	registers: [registry],
});

export const exhaustedTotal = new Counter({
	name: "llmrouter_exhausted_total",
	help: "Requests where no upstream model could satisfy the request, by route.",
	labelNames: ["route"] as const,
	registers: [registry],
});

export const modelEnabled = new Gauge({
	name: "llmrouter_model_enabled",
	help: "Whether a configured upstream model is enabled (1) or disabled (0).",
	labelNames: ["model"] as const,
	registers: [registry],
});

export const timetableEventsTotal = new Counter({
	name: "llmrouter_timetable_events_total",
	help: "Timetable events triggered, by type and model.",
	labelNames: ["type", "model"] as const,
	registers: [registry],
});

export const timetableEventErrorsTotal = new Counter({
	name: "llmrouter_timetable_event_errors_total",
	help: "Timetable event errors, by type.",
	labelNames: ["type"] as const,
	registers: [registry],
});

export const authFailuresTotal = new Counter({
	name: "llmrouter_auth_failures_total",
	help: "Rejected requests due to a missing or invalid router API key.",
	registers: [registry],
});

export const sessionRouteLookupsTotal = new Counter({
	name: "llmrouter_session_route_lookups_total",
	help: "Session route lookups, by outcome (hit/miss).",
	labelNames: ["outcome"] as const,
	registers: [registry],
});
