import { ModelManager } from "./model-manager.ts";
import { RouteTracker } from "./route-tracker.ts";
import { Route } from "./schema/route.schema.ts";

import { UpstreamFailure } from "#t/upstream-failure";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import Fastify, {
	FastifyInstance,
	FastifyReply,
	FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import { Readable } from "node:stream";
import {
	buildUserAgent,
	isContextOverflow,
	isPassthroughOnExhaustion,
	OVERFLOW_CANDIDATE_STATUSES,
	resolveSessionId,
	sendError,
	shouldFallback,
	toModelObject,
} from "./util.ts";
import {
	authFailuresTotal,
	contextOverflowTotal,
	exhaustedTotal,
	fallbacksTotal,
	httpRequestDuration,
	httpRequestsInProgress,
	httpRequestsTotal,
	passthroughTotal,
	registry,
	routeRequestsTotal,
	sessionRouteLookupsTotal,
	upstreamDuration,
	upstreamInFlight,
	upstreamRequestsTotal,
} from "./metrics.ts";

const requestStartedAt = new WeakMap<FastifyRequest, bigint>();

export class Router {
	private readonly routeTracker: RouteTracker;

	constructor(options: {
		host: string;
		port: number;
		apiKeys: Set<string>;
		routes: Record<string, Route>;
		modelManager: ModelManager;
		routeTracker?: RouteTracker;
		hook?: (app: FastifyInstance) => void;
	}) {
		this.routeTracker = options.routeTracker ?? new RouteTracker();

		const app = Fastify({
			logger: true,
			bodyLimit: 50 * 1024 * 1024,
		});

		app.register(cors, { origin: true }).then(async () => {
			app.addHook("onRequest", async (req) => {
				requestStartedAt.set(req, process.hrtime.bigint());
				httpRequestsInProgress.inc({ method: req.method });
			});

			app.addHook("onResponse", async (req, reply) => {
				const startedAt = requestStartedAt.get(req);
				if (startedAt === undefined) {
					return;
				}
				requestStartedAt.delete(req);
				httpRequestsInProgress.dec({ method: req.method });

				const labels = {
					method: req.method,
					route: req.routeOptions.url ?? "unmatched",
					status_code: String(reply.statusCode),
				};
				httpRequestsTotal.inc(labels);
				httpRequestDuration.observe(
					labels,
					Number(process.hrtime.bigint() - startedAt) / 1e9
				);
			});

			if (options.apiKeys.size) {
				app.addHook("onRequest", async (req, reply) => {
					if (
						req.method === "OPTIONS" ||
						req.url === "/health" ||
						req.url === "/metrics" ||
						// Read-only, session-scoped lookup keyed by an opaque
						// opencode session id; kept reachable without a key so
						// plugins can query it alongside /metrics.
						req.url.startsWith("/v1/sessions/")
					) {
						return;
					}

					const header = req.headers.authorization ?? "";
					let token = "";
					if (header.startsWith("Bearer ")) {
						token = header.slice(7);
					}

					if (!options.apiKeys.has(token)) {
						authFailuresTotal.inc();
						return sendError(
							reply,
							401,
							"Invalid API key",
							"authentication_error",
							"invalid_api_key"
						);
					}
				});
			}

			app.setNotFoundHandler((req, reply) => {
				return sendError(
					reply,
					404,
					`Unknown route: ${req.method} ${req.url}`,
					"invalid_request_error",
					"not_found"
				);
			});

			app.setErrorHandler(
				(err: Error & { statusCode?: number }, req, reply) => {
					req.log.error(err);
					const status = err.statusCode ?? 500;
					if (status >= 500) {
						return sendError(
							reply,
							status,
							"Internal server error",
							"api_error"
						);
					}
					return sendError(reply, status, err.message);
				}
			);

			app.get("/health", async () => {
				return { status: "ok" };
			});

			app.get("/metrics", async (_req, reply) => {
				reply.header("content-type", registry.contentType);
				return registry.metrics();
			});

			app.get("/v1/models", async () => {
				return {
					object: "list",
					data: Object.keys(options.routes).map(toModelObject),
				};
			});

			app.get<{ Params: { id: string } }>(
				"/v1/models/:id",
				async (req, reply) => {
					if (!options.routes[req.params.id]) {
						return sendError(
							reply,
							404,
							`The model \`${req.params.id}\` does not exist`,
							"invalid_request_error",
							"model_not_found"
						);
					}
					return toModelObject(req.params.id);
				}
			);

			app.get<{ Params: { sessionId: string } }>(
				"/v1/sessions/:sessionId/route",
				async (req, reply) => {
					const record = this.routeTracker.get(req.params.sessionId);
					if (!record) {
						sessionRouteLookupsTotal.inc({ outcome: "miss" });
						return sendError(
							reply,
							404,
							`No route recorded for session \`${req.params.sessionId}\``,
							"invalid_request_error",
							"session_not_found"
						);
					}
					sessionRouteLookupsTotal.inc({ outcome: "hit" });
					return record;
				}
			);

			app.post("/v1/chat/completions", (req, reply) =>
				this.proxy(
					req,
					reply,
					"/chat/completions",
					options.routes,
					options.modelManager
				)
			);
			app.post("/v1/completions", (req, reply) =>
				this.proxy(
					req,
					reply,
					"/completions",
					options.routes,
					options.modelManager
				)
			);
			app.post("/v1/embeddings", (req, reply) =>
				this.proxy(
					req,
					reply,
					"/embeddings",
					options.routes,
					options.modelManager
				)
			);

			app.post("/v1/responses", (req, reply) =>
				this.proxy(
					req,
					reply,
					"/responses",
					options.routes,
					options.modelManager
				)
			);

			await app.listen({
				port: options.port,
				host: options.host,
			});
		});
	}

	private async proxy(
		req: FastifyRequest,
		reply: FastifyReply,
		path: string,
		routes: Record<string, Route>,
		modelManager: ModelManager
	) {
		const body = req.body as Record<string, unknown> | undefined;
		const alias = body?.model;

		if (typeof alias !== "string") {
			return sendError(
				reply,
				400,
				"`model` is required",
				"invalid_request_error",
				"missing_model"
			);
		}

		const route = routes[alias];
		if (!route) {
			return sendError(
				reply,
				404,
				`The model \`${alias}\` does not exist`,
				"invalid_request_error",
				"model_not_found"
			);
		}

		const clientAbort = new AbortController();
		reply.raw.on("close", () => {
			if (!reply.raw.writableFinished) {
				clientAbort.abort();
			}
		});

		let lastFailure: UpstreamFailure | undefined;

		const sessionId = resolveSessionId(req, body);
		const userAgent = buildUserAgent(req);

		for (const modelId of route.models) {
			const model = modelManager.getModel(modelId);
			if (!model) {
				console.error(
					`Route "${alias}" referenced nonexistent model "${modelId}".`
				);
				continue;
			}
			if (!model.enabled) {
				console.debug(`Skipping model "${modelId}" because it's disabled.`);
				continue;
			}

			const headers: Record<string, string> = {
				"content-type": "application/json",
				"x-opencode-session": sessionId,
				"user-agent": userAgent,
			};
			if (model.apiKeyEnv) {
				const apiKey = process.env[model.apiKeyEnv];
				if (apiKey) {
					headers.authorization = `Bearer ${apiKey}`;
				}
			}

			const fetchStartedAt = process.hrtime.bigint();
			upstreamInFlight.inc({ model: modelId });

			let upstream: Response;
			try {
				upstream = await fetch(`${model.baseUrl}${path}`, {
					method: "POST",
					headers,
					body: JSON.stringify({ ...body, model: model.upstreamModel }),
					signal: clientAbort.signal,
				});
			} catch (err) {
				upstreamInFlight.dec({ model: modelId });
				upstreamRequestsTotal.inc({
					route: alias,
					model: modelId,
					status: "0",
				});
				upstreamDuration.observe(
					{ route: alias, model: modelId },
					Number(process.hrtime.bigint() - fetchStartedAt) / 1e9
				);
				if (clientAbort.signal.aborted) {
					return reply;
				}
				fallbacksTotal.inc({
					route: alias,
					model: modelId,
					reason: "network",
				});
				routeRequestsTotal.inc({
					route: alias,
					model: modelId,
					outcome: "fallback",
				});
				req.log.warn(err, `model "${modelId}" unreachable, trying next`);
				lastFailure = undefined;
				continue;
			}

			upstreamInFlight.dec({ model: modelId });
			upstreamRequestsTotal.inc({
				route: alias,
				model: modelId,
				status: String(upstream.status),
			});
			upstreamDuration.observe(
				{ route: alias, model: modelId },
				Number(process.hrtime.bigint() - fetchStartedAt) / 1e9
			);

			const contentType =
				upstream.headers.get("content-type") ?? "application/json";

			if (shouldFallback(upstream.status)) {
				const errorBody = await upstream.text().catch(() => "");
				fallbacksTotal.inc({
					route: alias,
					model: modelId,
					reason: "status",
				});
				routeRequestsTotal.inc({
					route: alias,
					model: modelId,
					outcome: "fallback",
				});
				req.log.warn(
					{ model: modelId, status: upstream.status },
					"upstream failed, trying next model"
				);
				lastFailure = {
					status: upstream.status,
					contentType,
					body: errorBody,
					overflow: false,
					model: modelId,
				};
				continue;
			}

			if (OVERFLOW_CANDIDATE_STATUSES.has(upstream.status)) {
				const errorBody = await upstream.text().catch(() => "");

				if (isContextOverflow(errorBody)) {
					contextOverflowTotal.inc({ model: modelId });
					fallbacksTotal.inc({
						route: alias,
						model: modelId,
						reason: "overflow",
					});
					routeRequestsTotal.inc({
						route: alias,
						model: modelId,
						outcome: "fallback",
					});
					req.log.warn(
						{ model: modelId, status: upstream.status },
						"prompt exceeds model context, trying next model"
					);
					lastFailure = {
						status: upstream.status,
						contentType,
						body: errorBody,
						overflow: true,
						model: modelId,
					};
					continue;
				}

				reply.status(upstream.status);
				reply.header("content-type", contentType);
				return reply.send(errorBody);
			}

			reply.status(upstream.status);
			reply.header("content-type", contentType);
			reply.header("x-router-model", modelId);
			this.routeTracker.record(sessionId, {
				route: alias,
				model: modelId,
				upstreamModel: model.upstreamModel,
			});
			req.log.info(
				{ route: alias, model: modelId, status: upstream.status },
				"routed"
			);
			routeRequestsTotal.inc({
				route: alias,
				model: modelId,
				outcome: "success",
			});

			if (!upstream.body) {
				return reply.send();
			}

			if (contentType.includes("text/event-stream")) {
				reply.header("cache-control", "no-cache");
				reply.header("connection", "keep-alive");
				reply.header("x-accel-buffering", "no");
			}

			return reply.send(
				Readable.fromWeb(upstream.body as unknown as NodeReadableStream)
			);
		}

		if (lastFailure && isPassthroughOnExhaustion(lastFailure)) {
			passthroughTotal.inc({
				route: alias,
				model: lastFailure.model,
				status: String(lastFailure.status),
			});
			reply.status(lastFailure.status);
			reply.header("content-type", lastFailure.contentType);
			return reply.send(lastFailure.body);
		}

		exhaustedTotal.inc({ route: alias });
		return sendError(
			reply,
			502,
			"No upstream model could satisfy the request",
			"api_error",
			"upstream_unavailable"
		);
	}
}
