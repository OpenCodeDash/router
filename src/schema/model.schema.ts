import { z } from "zod";

export const ModelSchema = z.object({
	baseUrl: z.url(),
	apiKeyEnv: z.string().min(1).optional(),
	upstreamModel: z.string().min(1),
	/**
	 * DeepSeek thinking mode rejects replayed assistant messages without
	 * `reasoning_content`. `auto` enables the shim for upstream models whose
	 * name contains "deepseek"; `always`/`never` force it on or off.
	 */
	reasoningContent: z.enum(["auto", "always", "never"]).default("auto"),
});

export type Model = z.infer<typeof ModelSchema>;
