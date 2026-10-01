import { Model } from "#s/model";
import { LoadedModel } from "#t/loaded-model";

export class ModelManager {
	private readonly models = new Map<string, LoadedModel>();

	constructor(models: Record<string, Model>) {
		for (const [id, model] of Object.entries(models)) {
			this.models.set(id, {
				...model,
				enabled: true,
			});
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
		if (enabled) {
			console.log(`Enabled model "${id}".`);
		} else {
			console.log(`Disabled model "${id}".`);
		}
	}
}
