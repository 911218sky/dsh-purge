/**
 * Slim redteam bootstrap: install bundled preset + skills under $DSH_HOME.
 * No SQLite asset store, no toolkit tools, no desktop paths.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  cpSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PurgeContext } from "../types.js";

export const name = "dsh-purge-redteam";
export const inject: string[] = [];

const REDTEAM_PRESET_ID = "redteam";

export function packagePaths() {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  return {
    root,
    presetDir: join(root, "presets", "redteam"),
    skills: join(root, "skills", "redteam"),
    agents: join(root, "presets", "redteam", "agents"),
  };
}

function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

export function redteamDataDir(): string {
  return join(dshHome(), "redteam");
}

export function userPresetRoot(): string {
  return join(dshHome(), ".agent-presets");
}

/** Sync bundled `skills/redteam/*.md` → `$DSH_HOME/redteam/skills`. */
export function installBundledSkills(): {
  action: "missing" | "updated" | "kept";
  path: string;
  copied: number;
} {
  const { skills } = packagePaths();
  const target = join(redteamDataDir(), "skills");
  if (!existsSync(skills)) return { action: "missing", path: target, copied: 0 };
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
  return { action: copied > 0 ? "updated" : "kept", path: target, copied };
}

/** Sync bundled `presets/redteam/agents/*.md` → `$DSH_HOME/redteam/engagements/_shared/agents`. */
export function installBundledAgents(): {
  action: "missing" | "updated" | "kept";
  path: string;
  copied: number;
} {
  const { agents } = packagePaths();
  const target = join(redteamDataDir(), "engagements", "_shared", "agents");
  if (!existsSync(agents)) return { action: "missing", path: target, copied: 0 };
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
  return { action: copied > 0 ? "updated" : "kept", path: target, copied };
}

/** Sync bundled `presets/redteam` → `$DSH_HOME/.agent-presets/redteam` (hash compare). */
export function installUserPreset(): {
  action: "missing" | "installed" | "updated" | "kept";
  path: string;
  copied: number;
} {
  const { presetDir } = packagePaths();
  const dest = join(userPresetRoot(), REDTEAM_PRESET_ID);
  if (!existsSync(presetDir)) return { action: "missing", path: dest, copied: 0 };

  const syncFile = (rel: string): boolean => {
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

  const walk = (dir: string, base = ""): string[] => {
    const out: string[] = [];
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
    return { action: "installed", path: dest, copied: walk("").length };
  }

  for (const rel of walk("")) {
    if (syncFile(rel)) copied += 1;
  }
  return { action: copied > 0 ? "updated" : "kept", path: dest, copied };
}

export function apply(ctx: PurgeContext): void {
  const skills = installBundledSkills();
  const agents = installBundledAgents();
  const preset = installUserPreset();
  try {
    console.log(
      `[dsh-purge/redteam] skills=${skills.action}(${skills.copied}) agents=${agents.action}(${agents.copied}) preset=${preset.action}(${preset.copied})`,
    );
  } catch {
    /* ignore */
  }
  void ctx;
}

export default { name, inject, apply };
