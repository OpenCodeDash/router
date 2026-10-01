import { ModelManager } from "./model-manager.ts";
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

export class Router {
	constructor(options: {
		host: string;
		port: number;
		apiKeys: Set<string>;
		routes: Record<string, Route>;
		modelManager: ModelManager;
		hook?: (app: FastifyInstance) => void;
	}) {
		const app = Fastify({
			logger: true,
			bodyLimit: 50 * 1024 * 1024,
		});

		app.register(cors, { origin: true }).then(async () => {
			if (options.apiKeys.size) {
				app.addHook("onRequest", async (req, reply) => {
					if (req.method === "OPTIONS" || req.url === "/health") {
						return;
					}

					const header = req.headers.authorization ?? "";
					let token = "";
					if (header.startsWith("Bearer ")) {
						token = header.slice(7);
					}

					if (!options.apiKeys.has(token)) {
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

			app.post("/v1/responses", async (_req, reply) => {
				return sendError(
					reply,
					501,
					"The Responses API is not implemented",
					"api_error",
					"not_implemented"
				);
			});

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

			let upstream: Response;
			try {
				upstream = await fetch(`${model.baseUrl}${path}`, {
					method: "POST",
					headers,
					body: JSON.stringify({ ...body, model: model.upstreamModel }),
					signal: clientAbort.signal,
				});
			} catch (err) {
				if (clientAbort.signal.aborted) {
					return reply;
				}
				req.log.warn(err, `model "${modelId}" unreachable, trying next`);
				lastFailure = undefined;
				continue;
			}

			const contentType =
				upstream.headers.get("content-type") ?? "application/json";

			if (shouldFallback(upstream.status)) {
				const errorBody = await upstream.text().catch(() => "");
				req.log.warn(
					{ model: modelId, status: upstream.status },
					"upstream failed, trying next model"
				);
				lastFailure = {
					status: upstream.status,
					contentType,
					body: errorBody,
					overflow: false,
				};
				continue;
			}

			if (OVERFLOW_CANDIDATE_STATUSES.has(upstream.status)) {
				const errorBody = await upstream.text().catch(() => "");

				if (isContextOverflow(errorBody)) {
					req.log.warn(
						{ model: modelId, status: upstream.status },
						"prompt exceeds model context, trying next model"
					);
					lastFailure = {
						status: upstream.status,
						contentType,
						body: errorBody,
						overflow: true,
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
			req.log.info(
				{ route: alias, model: modelId, status: upstream.status },
				"routed"
			);

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
			reply.status(lastFailure.status);
			reply.header("content-type", lastFailure.contentType);
			return reply.send(lastFailure.body);
		}

		return sendError(
			reply,
			502,
			"No upstream model could satisfy the request",
			"api_error",
			"upstream_unavailable"
		);
	}
}
