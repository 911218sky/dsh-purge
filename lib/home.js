import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// src/home.ts
/** Resolve `$DSH_HOME` for the Web profile. */
function findDshHome() {
	const fromEnv = String(process.env.DSH_HOME || "").trim();
	if (fromEnv) return path.normalize(fromEnv);
	return path.normalize(path.join(os.homedir(), ".dsh"));
}
function promptInjectPath(dshHome = findDshHome()) {
	return path.join(dshHome, "prompt-inject.md");
}
function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}
function readTextFile(fp) {
	try {
		return fs.readFileSync(fp, "utf8");
	} catch {
		return "";
	}
}
function writeTextFile(fp, text) {
	ensureDir(path.dirname(fp));
	const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
	fs.writeFileSync(tmp, text, "utf8");
	try {
		fs.renameSync(tmp, fp);
	} catch {
		try {
			fs.unlinkSync(tmp);
		} catch {}
		fs.writeFileSync(fp, text, "utf8");
	}
}
export { ensureDir, findDshHome, promptInjectPath, readTextFile, writeTextFile };
