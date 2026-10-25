import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDshHome } from "../../home.js";

const ENV_KEYS = ["FOFA_KEY", "REDTEAM_VPS_HOST", "REDTEAM_VPS_KEY"] as const;

function readEnvFile(dshHome: string): Record<string, string> {
  const out: Record<string, string> = {};
  const fp = path.join(dshHome, ".env");
  if (!fs.existsSync(fp)) return out;
  for (const line of fs.readFileSync(fp, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let raw = m[2].trim();
    if (!/^["']/.test(raw)) raw = raw.replace(/\s+#.*$/, "");
    const value = raw.replace(/^["']|["']$/g, "").trim();
    if (value) out[m[1]] = value;
  }
  return out;
}

function bundledSkillNames(): string[] {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const skillsDir = path.join(here, "..", "..", "..", "skills", "redteam");
    if (!fs.existsSync(skillsDir)) return [];
    return fs
      .readdirSync(skillsDir)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

function checkPathExists(p: string | undefined): boolean {
  if (!p?.trim()) return false;
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function runPreflight(include?: string) {
  const dshHome = findDshHome();
  const envFile = readEnvFile(dshHome);
  const effectiveEnv = { ...process.env, ...envFile } as Record<string, string>;
  const redteamDir = path.join(dshHome, "redteam");
  const markerFile = path.join(redteamDir, ".setup-complete");
  const setupScript = path.join(redteamDir, "setup.sh");
  const skillsSynced = path.join(redteamDir, "skills");
  const bundled = bundledSkillNames();
  const only = include
    ? include
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : bundled;

  const fofaKey = effectiveEnv.FOFA_KEY || "";
  const vpsKey =
    effectiveEnv.REDTEAM_VPS_KEY || path.join(redteamDir, "toolkit", "vps", "id_rsa");
  const vpsHost = effectiveEnv.REDTEAM_VPS_HOST || "";
  const missing: string[] = [];
  if (!fofaKey) missing.push("FOFA_KEY（写进 $DSH_HOME/.env 或环境变量；侧栏 dsh-purge 可编辑提示词，环境变量需重启 dsh web）");
  if (!checkPathExists(vpsKey) && !vpsHost) {
    missing.push("VPS 登录（REDTEAM_VPS_HOST + REDTEAM_VPS_KEY 或私钥路径）");
  }

  const available = only.filter((name) => bundled.includes(name));
  const broken = only.filter((name) => !bundled.includes(name));

  return {
    mode: "file-store-v2",
    storage: "jsonl under $DSH_HOME/redteam/engagements/",
    runtime: process.platform,
    onboarding: {
      complete: fs.existsSync(markerFile) || (!missing.length && fs.existsSync(skillsSynced)),
      setup_script: { exists: fs.existsSync(setupScript), path: setupScript },
      marker: { exists: fs.existsSync(markerFile), path: markerFile },
      skills_dir: { exists: fs.existsSync(skillsSynced), path: skillsSynced, count: fs.existsSync(skillsSynced) ? fs.readdirSync(skillsSynced).filter((f) => f.endsWith(".md")).length : 0 },
    },
    env: {
      keys_present: ENV_KEYS.filter((k) => effectiveEnv[k]),
      fofa_configured: Boolean(fofaKey),
      fofa_preview: fofaKey.length > 8 ? `${fofaKey.slice(0, 4)}…${fofaKey.slice(-4)}` : fofaKey ? "(已配置)" : "(缺失)",
      vps_host: vpsHost || null,
      vps_key_exists: checkPathExists(vpsKey),
    },
    missing,
    available,
    broken,
    bundled_skill_count: bundled.length,
    hint: "v2.0 使用 JSONL 文件落库（非 SQLite）。环境变量改 $DSH_HOME/.env 后需重启 dsh web。",
  };
}
