import { z } from "zod";

export const DisableModelEventSchema = z.object({
	type: z.literal("disable-model"),
	model: z.string().min(1),
});

export type DisableModelEvent = z.infer<typeof DisableModelEventSchema>;
