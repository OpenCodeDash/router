import dotenv from "dotenv";
import { getConfig } from "./config.ts";
import { ModelManager } from "./model-manager.ts";
import { EventManager } from "./event-manager.ts";
import { TimetableManager } from "./timetable-manager.ts";
import { Router } from "./router.ts";

dotenv.config({
	quiet: true,
});

const apiKeys = new Set(
	(process.env.ROUTER_API_KEYS ?? "")
		.split(",")
		.map((key) => key.trim())
		.filter(Boolean)
);

console.log(`Registered ${apiKeys.size} router API keys.`);
if (!apiKeys.size) {
	console.warn("Router authentication is disabled.");
}

async function start() {
	const config = await getConfig();

	const modelManager = new ModelManager(config.models);
	const eventManager = new EventManager(modelManager);
	const timetableManager = new TimetableManager(eventManager);

	for (const event of config.timetable ?? []) {
		timetableManager.registerCron(event);
	}
	console.log(`Registered ${config.timetable?.length ?? 0} timetable events.`);

	const router = new Router({
		host: process.env.HOST ?? "0.0.0.0",
		port: Number(process.env.PORT ?? 3000),
		routes: config.routes,
		modelManager: modelManager,
		apiKeys,
		hook: (app) => {
			app.addHook("onClose", () => timetableManager.destroy());
		},
	});
}

start().catch((err) => {
	console.error(err);
	process.exit(1);
});
