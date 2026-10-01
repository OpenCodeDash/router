import { readFileSync } from "fs";
import type PackageJson from "../../package.json";

function getVersion() {
	try {
		const packageJson = readFileSync("./package.json", "utf-8");
		const json = JSON.parse(packageJson) as typeof PackageJson;
		return json.version;
	} catch {
		return null;
	}
}

export const VERSION = getVersion() || "Unknown";
