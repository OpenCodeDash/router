import { CronEvent } from "#s/cron-event";
import { Cron } from "croner";
import { EventManager } from "./event-manager.ts";
import { timetableEventErrorsTotal } from "./metrics.ts";

export class TimetableManager {
	private readonly jobs = new Map<CronEvent, Cron>();

	constructor(private readonly eventManager: EventManager) {}

	registerCron(cronEvent: CronEvent) {
		if (this.jobs.has(cronEvent)) {
			throw new Error("Cron has already been registered");
		}
		this.jobs.set(
			cronEvent,
			new Cron(
				cronEvent.cron,
				{
					catch: (e) => {
						timetableEventErrorsTotal.inc({
							type: cronEvent.event.type,
						});
						console.error(
							`Timetable event "${cronEvent.event.type}" failed:`,
							e
						);
					},
				},
				() => this.eventManager.trigger(cronEvent.event)
			)
		);
	}

	destroy() {
		for (const job of this.jobs.values()) {
			job.stop();
		}
		this.jobs.clear();
	}
}
