import { FALLBACK_STATUSES } from "#c/fallback-statuses";
import { FastifyReply, FastifyRequest } from "fastify";
import { Cron } from "croner";
import type { UpstreamFailure } from "#t/upstream-failure";
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
	// opencode always sends `x-opencode-session-id`; `x-opencode-session` is only
	// sent for `opencode*` providers, so prefer the former.
	const header =
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
