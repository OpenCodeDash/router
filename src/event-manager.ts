import { ModelManager } from "./model-manager.ts";
import { Event } from "#s/event/event";

export class EventManager {
	constructor(private readonly modelManager: ModelManager) {}

	trigger(event: Event) {
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
