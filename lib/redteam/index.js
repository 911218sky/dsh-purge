import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// src/redteam/index.ts
/**
* Slim redteam bootstrap: install bundled preset + skills under $DSH_HOME.
* No SQLite asset store, no toolkit tools, no desktop paths.
*/
const name = "dsh-purge-redteam";
const inject = [];
const REDTEAM_PRESET_ID = "redteam";
function packagePaths() {
	const root = fileURLToPath(new URL("../..", import.meta.url));
	return {
		root,
		presetDir: join(root, "presets", "redteam"),
		skills: join(root, "skills", "redteam"),
		agents: join(root, "presets", "redteam", "agents")
	};
}
function dshHome() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}
function redteamDataDir() {
	return join(dshHome(), "redteam");
}
function userPresetRoot() {
	return join(dshHome(), ".agent-presets");
}
/** Sync bundled `skills/redteam/*.md` → `$DSH_HOME/redteam/skills`. */
function installBundledSkills() {
	const { skills } = packagePaths();
	const target = join(redteamDataDir(), "skills");
	if (!existsSync(skills)) return {
		action: "missing",
		path: target,
		copied: 0
	};
	mkdirSync(target, { recursive: true });
	const files = readdirSync(skills).filter((f) => f.endsWith(".md"));
	let copied = 0;
	for (const file of files) {
		const wanted = readFileSync(join(skills, file));
		const dest = join(target, file);
		let same = false;
		try {
			same = readFileSync(dest).equals(wanted);
		} catch {
			same = false;
		}
		if (same) continue;
		writeFileSync(dest, wanted);
		copied += 1;
	}
	return {
		action: copied > 0 ? "updated" : "kept",
		path: target,
		copied
	};
}
/** Sync bundled `presets/redteam/agents/*.md` → `$DSH_HOME/redteam/engagements/_shared/agents`. */
function installBundledAgents() {
	const { agents } = packagePaths();
	const target = join(redteamDataDir(), "engagements", "_shared", "agents");
	if (!existsSync(agents)) return {
		action: "missing",
		path: target,
		copied: 0
	};
	mkdirSync(target, { recursive: true });
	const files = readdirSync(agents).filter((f) => f.endsWith(".md"));
	let copied = 0;
	for (const file of files) {
		const wanted = readFileSync(join(agents, file));
		const dest = join(target, file);
		let same = false;
		try {
			same = readFileSync(dest).equals(wanted);
		} catch {
			same = false;
		}
		if (same) continue;
		writeFileSync(dest, wanted);
		copied += 1;
	}
	return {
		action: copied > 0 ? "updated" : "kept",
		path: target,
		copied
	};
}
/** First-time copy of `presets/redteam` → `$DSH_HOME/.agent-presets/redteam`. */
function installUserPreset() {
	const { presetDir } = packagePaths();
	const dest = join(userPresetRoot(), REDTEAM_PRESET_ID);
	if (!existsSync(presetDir)) return {
		action: "missing",
		path: dest
	};
	if (existsSync(dest)) return {
		action: "kept",
		path: dest
	};
	mkdirSync(userPresetRoot(), { recursive: true });
	cpSync(presetDir, dest, { recursive: true });
	return {
		action: "installed",
		path: dest
	};
}
function apply(ctx) {
	const skills = installBundledSkills();
	const agents = installBundledAgents();
	const preset = installUserPreset();
	try {
		console.log(`[dsh-purge/redteam] skills=${skills.action}(${skills.copied}) agents=${agents.action}(${agents.copied}) preset=${preset.action}`);
	} catch {}
}
var redteam_default = {
	name,
	inject,
	apply
};
export { apply, redteam_default as default, inject, installBundledAgents, installBundledSkills, installUserPreset, name, packagePaths, redteamDataDir, userPresetRoot };
