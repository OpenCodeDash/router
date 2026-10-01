import { z } from "zod";

export const RouteSchema = z.object({
	models: z.array(z.string().min(1)).nonempty(),
});

export type Route = z.infer<typeof RouteSchema>;
