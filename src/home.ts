import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Resolve `$DSH_HOME` for the Web profile. */
export function findDshHome(): string {
  const fromEnv = String(process.env.DSH_HOME || "").trim();
  if (fromEnv) return path.normalize(fromEnv);
  return path.normalize(path.join(os.homedir(), ".dsh"));
}

export function promptInjectPath(dshHome = findDshHome()): string {
  return path.join(dshHome, "prompt-inject.md");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function readTextFile(fp: string): string {
  try {
    return fs.readFileSync(fp, "utf8");
  } catch {
    return "";
  }
}

export function writeTextFile(fp: string, text: string): void {
  ensureDir(path.dirname(fp));
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  try {
    fs.renameSync(tmp, fp);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    fs.writeFileSync(fp, text, "utf8");
  }
}
