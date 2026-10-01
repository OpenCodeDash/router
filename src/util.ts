import { FALLBACK_STATUSES } from "#c/fallback-statuses";
import { FastifyReply } from "fastify";
import { Cron } from "croner";
import type { UpstreamFailure } from "#t/upstream-failure";

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
