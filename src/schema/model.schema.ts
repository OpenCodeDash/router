import { z } from "zod";

export const ModelSchema = z.object({
	baseUrl: z.url(),
	apiKeyEnv: z.string().min(1).optional(),
	upstreamModel: z.string().min(1),
});

export type Model = z.infer<typeof ModelSchema>;
