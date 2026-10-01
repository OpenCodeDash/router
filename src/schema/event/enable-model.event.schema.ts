import { z } from "zod";

export const EnableModelEventSchema = z.object({
	type: z.literal("enable-model"),
	model: z.string().min(1),
});

export type EnableModelEvent = z.infer<typeof EnableModelEventSchema>;
