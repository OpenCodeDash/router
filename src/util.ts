import { FALLBACK_STATUSES } from "#c/fallback-statuses";
import { FastifyReply } from "fastify";
import { Cron } from "croner";

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

// Only rate limits and server errors are safe to show the client once every
// model has failed. A 401/403/404 from upstream is a router config problem,
// and passing it through would tell the client their own key is wrong.
export function isPassthroughOnExhaustion(status: number) {
	return status === 429 || status >= 500;
}

export function isValidCron(value: string) {
	try {
		new Cron(value);
		return true;
	} catch {
		return false;
	}
}
