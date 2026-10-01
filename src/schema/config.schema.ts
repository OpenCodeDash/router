import { z } from "zod";
import { RouteSchema } from "./route.schema.ts";
import { ModelSchema } from "./model.schema.ts";
import { CronEventSchema } from "./cron-event.schema.ts";

export const ConfigSchema = z.object({
	models: z.record(z.string(), ModelSchema),
	routes: z.record(z.string(), RouteSchema),
	timetable: z.array(CronEventSchema).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
