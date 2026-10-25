import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
/** Sync bundled `presets/redteam` → `$DSH_HOME/.agent-presets/redteam` (hash compare). */
function installUserPreset() {
	const { presetDir } = packagePaths();
	const dest = join(userPresetRoot(), REDTEAM_PRESET_ID);
	if (!existsSync(presetDir)) return {
		action: "missing",
		path: dest,
		copied: 0
	};
	const syncFile = (rel) => {
		const src = join(presetDir, rel);
		const dst = join(dest, rel);
		if (!existsSync(src)) return false;
		mkdirSync(dirname(dst), { recursive: true });
		const wanted = readFileSync(src);
		let same = false;
		try {
			same = readFileSync(dst).equals(wanted);
		} catch {
			same = false;
		}
		if (same) return false;
		writeFileSync(dst, wanted);
		return true;
	};
	const walk = (dir, base = "") => {
		const out = [];
		for (const ent of readdirSync(join(presetDir, dir), { withFileTypes: true })) {
			const rel = join(base, ent.name).replace(/\\/g, "/");
			if (ent.isDirectory()) out.push(...walk(join(dir, ent.name), rel));
			else out.push(rel);
		}
		return out;
	};
	let copied = 0;
	if (!existsSync(dest)) {
		mkdirSync(userPresetRoot(), { recursive: true });
		cpSync(presetDir, dest, { recursive: true });
		return {
			action: "installed",
			path: dest,
			copied: walk("").length
		};
	}
	for (const rel of walk("")) if (syncFile(rel)) copied += 1;
	return {
		action: copied > 0 ? "updated" : "kept",
		path: dest,
		copied
	};
}
function apply(ctx) {
	const skills = installBundledSkills();
	const agents = installBundledAgents();
	const preset = installUserPreset();
	try {
		console.log(`[dsh-purge/redteam] skills=${skills.action}(${skills.copied}) agents=${agents.action}(${agents.copied}) preset=${preset.action}(${preset.copied})`);
	} catch {}
}
var redteam_default = {
	name,
	inject,
	apply
};
export { apply, redteam_default as default, inject, installBundledAgents, installBundledSkills, installUserPreset, name, packagePaths, redteamDataDir, userPresetRoot };
