import { ConfigSchema } from "#s/config";
import { readFile } from "fs/promises";
import { parse } from "yaml";
import { z } from "zod";

export async function getConfig() {
	const rawContents = await readFile("config.yaml", "utf-8");
	try {
		const rawConfig = parse(rawContents);

		const result = ConfigSchema.safeParse(rawConfig);
		if (!result.success) {
			throw new Error(`Invalid config.yaml:\n${z.prettifyError(result.error)}`);
		}
		return result.data;
	} catch (e) {
		console.error("Failed to parse config:", e);
		throw new Error("Failed to parse config: Invalid YAML");
	}
}
