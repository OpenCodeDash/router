import { z } from "zod";
import { isValidCron } from "../util.ts";
import { EventSchema } from "./event/event.schema.ts";

export const CronEventSchema = z.object({
	cron: z.string().refine(isValidCron, {
		message: "Invalid cron expression",
	}),
	event: EventSchema,
});

export type CronEvent = z.infer<typeof CronEventSchema>;
