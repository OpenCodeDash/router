import { ModelManager } from "./model-manager.ts";
import { Event } from "#s/event/event";
import { timetableEventsTotal } from "./metrics.ts";

export class EventManager {
	constructor(private readonly modelManager: ModelManager) {}

	trigger(event: Event) {
		timetableEventsTotal.inc({ type: event.type, model: event.model });
		switch (event.type) {
			case "enable-model": {
				this.modelManager.setModelEnabled(event.model, true);
				break;
			}
			case "disable-model": {
				this.modelManager.setModelEnabled(event.model, false);
				break;
			}
		}
	}
}
