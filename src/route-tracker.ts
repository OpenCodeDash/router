export type SessionRoute = {
	route: string;
	model: string;
	upstreamModel: string;
	time: number;
};

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5000;

/**
 * Remembers the upstream model that most recently served each opencode session,
 * so a client (e.g. an opencode plugin) can attribute cost to the real model
 * after fallback. In-memory only: a restart clears it, matching ModelManager.
 */
export class RouteTracker {
	private readonly records = new Map<string, SessionRoute>();
	private readonly ttlMs: number;
	private readonly maxEntries: number;

	constructor(options: { ttlMs?: number; maxEntries?: number } = {}) {
		this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
		this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
	}

	record(sessionId: string, route: Omit<SessionRoute, "time">) {
		this.records.delete(sessionId);
		this.records.set(sessionId, { ...route, time: Date.now() });

		while (this.records.size > this.maxEntries) {
			const oldest = this.records.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this.records.delete(oldest);
		}
	}

	get(sessionId: string): SessionRoute | undefined {
		const record = this.records.get(sessionId);
		if (!record) {
			return undefined;
		}
		if (Date.now() - record.time > this.ttlMs) {
			this.records.delete(sessionId);
			return undefined;
		}
		return record;
	}
}
