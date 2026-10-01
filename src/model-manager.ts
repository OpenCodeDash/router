import { Model } from "#s/model";
import { LoadedModel } from "#t/loaded-model";
import { modelEnabled } from "./metrics.ts";

export class ModelManager {
	private readonly models = new Map<string, LoadedModel>();

	constructor(models: Record<string, Model>) {
		for (const [id, model] of Object.entries(models)) {
			this.models.set(id, {
				...model,
				enabled: true,
			});
			modelEnabled.set({ model: id }, 1);
		}
	}

	getModel(id: string) {
		return this.models.get(id) ?? null;
	}

	setModelEnabled(id: string, enabled: boolean) {
		const model = this.getModel(id);
		if (!model) {
			throw new Error("Model doesn't exist");
		}
		model.enabled = enabled;
		modelEnabled.set({ model: id }, enabled ? 1 : 0);
		if (enabled) {
			console.log(`Enabled model "${id}".`);
		} else {
			console.log(`Disabled model "${id}".`);
		}
	}
}
