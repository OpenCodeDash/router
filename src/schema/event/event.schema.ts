import { z } from "zod";
import { EnableModelEventSchema } from "./enable-model.event.schema.ts";
import { DisableModelEventSchema } from "./disable-model.event.schema.ts";

export const EventSchema = z.union([
	EnableModelEventSchema,
	DisableModelEventSchema,
]);

export type Event = z.infer<typeof EventSchema>;
