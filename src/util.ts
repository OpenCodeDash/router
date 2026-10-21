import { FALLBACK_STATUSES } from "#c/fallback-statuses";
import { FastifyReply, FastifyRequest } from "fastify";
import { Cron } from "croner";
import type { UpstreamFailure } from "#t/upstream-failure";
import type { Model } from "#s/model";
import { createHash, randomUUID } from "crypto";
import { USER_AGENT } from "#c/user-agent";

export function sendError(
	reply: FastifyReply,
	status: number,
	message: string,
	type = "invalid_request_error",
	code: string | null = null
) {
	return reply.status(status).send({
		error: { message, type, param: null, code },
	});
}

export function toModelObject(id: string) {
	return {
		id,
		object: "model" as const,
		created: 0,
		owned_by: "router",
	};
}

export function needsReasoningContent(
	model: Pick<Model, "upstreamModel" | "reasoningContent">
) {
	if (model.reasoningContent === "always") {
		return true;
	}
	if (model.reasoningContent === "never") {
		return false;
	}
	return /deepseek/i.test(model.upstreamModel);
}

/**
 * DeepSeek thinking mode requires every replayed assistant message to carry a
 * `reasoning_content` field, even when it's empty. OpenAI client libraries drop
 * the field because it isn't part of the chat schema, so restore it before
 * forwarding the request.
 */
export function addReasoningContent(
	body: Record<string, unknown>,
	model: Pick<Model, "upstreamModel" | "reasoningContent">
) {
	if (!needsReasoningContent(model)) {
		return body;
	}

	const messages = body.messages;
	if (!Array.isArray(messages)) {
		return body;
	}

	let changed = false;
	const next = messages.map((message: unknown) => {
		if (typeof message !== "object" || message === null || Array.isArray(message)) {
			return message;
		}
		const assistant = message as Record<string, unknown>;
		if (
			assistant.role !== "assistant" ||
			typeof assistant.reasoning_content === "string"
		) {
			return message;
		}
		changed = true;
		const reasoning =
			typeof assistant.reasoning === "string" ? assistant.reasoning : "";
		return { ...assistant, reasoning_content: reasoning };
	});

	return changed ? { ...body, messages: next } : body;
}

export function shouldFallback(status: number) {
	return (
		FALLBACK_STATUSES.includes(status as (typeof FALLBACK_STATUSES)[0]) ||
		status >= 500
	);
}

export const OVERFLOW_CANDIDATE_STATUSES = new Set([400, 413, 422]);

const CONTEXT_OVERFLOW_PATTERN =
	/context[ _]length|context size|context window|exceed_context_size|maximum context|prompt is too long|too many (input )?tokens|input is too long/i;

export function isContextOverflow(errorBody: string) {
	return CONTEXT_OVERFLOW_PATTERN.test(errorBody);
}

export function isPassthroughOnExhaustion(failure: UpstreamFailure) {
	return failure.overflow || failure.status === 429 || failure.status >= 500;
}

export function isValidCron(value: string) {
	try {
		new Cron(value);
		return true;
	} catch {
		return false;
	}
}

function hashSessionSeed(seed: unknown) {
	return createHash("sha256")
		.update(JSON.stringify(seed))
		.digest("hex")
		.slice(0, 32);
}

export function resolveSessionId(
	req: FastifyRequest,
	body: Record<string, unknown> | undefined
) {
	// opencode 1.18.x sends the session id under different headers depending on
	// the provider: `x-session-id` / `x-session-affinity` for custom providers
	// (e.g. "router"), and `x-opencode-session` for `opencode*` providers. Newer
	// builds also send `x-opencode-session-id`. Prefer whichever is present.
	const header =
		req.headers["x-session-id"] ??
		req.headers["x-session-affinity"] ??
		req.headers["x-opencode-session-id"] ??
		req.headers["x-opencode-session"];
	if (typeof header === "string" && header) {
		return header;
	}

	const messages = body?.messages;
	if (Array.isArray(messages) && messages.length) {
		return hashSessionSeed(messages.slice(0, 2));
	}

	if (body?.input !== undefined) {
		return hashSessionSeed(body.input);
	}

	return randomUUID();
}

export function buildUserAgent(req: FastifyRequest) {
	const clientAgent = req.headers["user-agent"];
	if (typeof clientAgent === "string" && clientAgent) {
		return `${USER_AGENT} ${clientAgent}`;
	}
	return USER_AGENT;
}
