import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { findDshHome } from "../home.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(text: string): string {
  const base = String(text || "engagement")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (base) return base;
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 10);
  return `eng-${hash}`;
}

export function engagementsRoot(dshHome = findDshHome()): string {
  return path.join(dshHome, "redteam", "engagements");
}

export interface EngagementMeta {
  id: string;
  slug: string;
  target: string;
  scope: string[];
  created_at: string;
  updated_at: string;
  storage: "jsonl";
}

function metaPath(dir: string): string {
  return path.join(dir, "meta.json");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(fp: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(fp: string, value: unknown): void {
  ensureDir(path.dirname(fp));
  const tmp = `${fp}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, fp);
}

export function engagementDirById(idOrSlug: string, dshHome = findDshHome()): string {
  const root = engagementsRoot(dshHome);
  if (!fs.existsSync(root)) throw new Error(`靶标不存在: ${idOrSlug}`);
  const direct = path.join(root, idOrSlug);
  if (fs.existsSync(metaPath(direct))) return direct;
  for (const name of fs.readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const meta = readJson<EngagementMeta>(metaPath(path.join(root, name.name)));
    if (meta && (meta.id === idOrSlug || meta.slug === idOrSlug || meta.target === idOrSlug)) {
      return path.join(root, name.name);
    }
  }
  throw new Error(`靶标不存在: ${idOrSlug}`);
}

export function listEngagements(dshHome = findDshHome()): EngagementMeta[] {
  const root = engagementsRoot(dshHome);
  if (!fs.existsSync(root)) {
    ensureDir(root);
    return [];
  }
  const out: EngagementMeta[] = [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const meta = readJson<EngagementMeta>(metaPath(path.join(root, ent.name)));
    if (meta) out.push(meta);
  }
  return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function openEngagement(
  target: string,
  scope?: string[],
  dshHome = findDshHome(),
): EngagementMeta {
  const name = String(target || "").trim();
  if (!name) throw new Error("target 不能为空");
  const slug = slugify(name);
  const root = engagementsRoot(dshHome);
  ensureDir(root);
  let dir = path.join(root, slug);
  let meta = fs.existsSync(metaPath(dir)) ? readJson<EngagementMeta>(metaPath(dir)) : null;
  const ts = nowIso();
  if (!meta) {
    meta = {
      id: randomUUID(),
      slug,
      target: name,
      scope: Array.isArray(scope) ? scope.filter(Boolean) : [],
      created_at: ts,
      updated_at: ts,
      storage: "jsonl",
    };
    ensureDir(dir);
    writeJson(metaPath(dir), meta);
    for (const file of ["assets.jsonl", "vulns.jsonl", "chain.jsonl", "sessions.jsonl", "links.jsonl", "credentials.jsonl", "evidence.jsonl"]) {
      const fp = path.join(dir, file);
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, "", "utf8");
    }
  } else {
    meta.updated_at = ts;
    if (Array.isArray(scope) && scope.length) meta.scope = scope;
    writeJson(metaPath(dir), meta);
  }
  return meta;
}

export function dataFile(engagementId: string, kind: string, dshHome = findDshHome()): string {
  const dir = engagementDirById(engagementId, dshHome);
  return path.join(dir, `${kind}.jsonl`);
}

export function readJsonl(fp: string): Record<string, unknown>[] {
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const out: Record<string, unknown>[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

export function appendJsonl(fp: string, record: Record<string, unknown>): Record<string, unknown> {
  ensureDir(path.dirname(fp));
  const row = { id: randomUUID(), created_at: nowIso(), ...record };
  fs.appendFileSync(fp, `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

export function updateJsonlById(
  fp: string,
  id: string,
  patch: Record<string, unknown>,
): Record<string, unknown> | null {
  const rows = readJsonl(fp);
  let hit: Record<string, unknown> | null = null;
  const next = rows.map((row) => {
    if (String(row.id) !== id) return row;
    hit = { ...row, ...patch, updated_at: nowIso() };
    return hit;
  });
  if (!hit) return null;
  fs.writeFileSync(fp, next.map((r) => JSON.stringify(r)).join("\n") + (next.length ? "\n" : ""), "utf8");
  return hit;
}

export function upsertAsset(
  engagementId: string,
  input: Record<string, unknown>,
  dshHome = findDshHome(),
): Record<string, unknown> {
  const fp = dataFile(engagementId, "assets", dshHome);
  const key = String(input.ip || input.url || input.target || input.name || "").trim();
  const rows = readJsonl(fp);
  const idx = rows.findIndex(
    (r) =>
      (key && (r.ip === key || r.url === key || r.target === key || r.name === key)) ||
      (input.id && r.id === input.id),
  );
  const row = {
    ...(idx >= 0 ? rows[idx] : {}),
    ...input,
    updated_at: nowIso(),
    id: idx >= 0 ? rows[idx].id : randomUUID(),
    created_at: idx >= 0 ? rows[idx].created_at || nowIso() : nowIso(),
  };
  if (idx >= 0) {
    rows[idx] = row;
    fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  } else {
    appendJsonl(fp, row);
  }
  return row;
}

export function stats(engagementId: string, dshHome = findDshHome()): Record<string, number> {
  return {
    assets: readJsonl(dataFile(engagementId, "assets", dshHome)).length,
    vulns: readJsonl(dataFile(engagementId, "vulns", dshHome)).length,
    chain: readJsonl(dataFile(engagementId, "chain", dshHome)).length,
    sessions: readJsonl(dataFile(engagementId, "sessions", dshHome)).length,
    links: readJsonl(dataFile(engagementId, "links", dshHome)).length,
    credentials: readJsonl(dataFile(engagementId, "credentials", dshHome)).length,
    evidence: readJsonl(dataFile(engagementId, "evidence", dshHome)).length,
  };
}

export function compactAsset(a: Record<string, unknown>): Record<string, unknown> {
  return {
    id: a.id,
    ip: a.ip,
    url: a.url,
    target: a.target,
    name: a.name,
    state: a.state,
    priority: a.priority,
    potential: a.potential,
    test_status: a.test_status,
    provenance: a.provenance,
    tool: a.tool,
    discovered_at: a.discovered_at || a.created_at,
    tags: a.tags,
    surface: a.surface,
  };
}
