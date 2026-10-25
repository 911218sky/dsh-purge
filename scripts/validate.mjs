#!/usr/bin/env node
/**
 * dsh-purge validation suite — structural + integration + skill-discovery smoke.
 * Run: npm run validate
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  rewritePromptAssembly,
  escapeDshInterpolation,
  peelChatmlEnvelope,
  GLOBAL_PROMPT_ORDER,
  CAPABILITY_SECTION,
  capabilityProtocolText,
} from "../lib/identity.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "skills", "redteam");
const srcPrompt = join(root, "src", "defaults", "prompt-inject.md");
const libPrompt = join(root, "lib", "defaults", "prompt-inject.md");

const results = [];
let failed = 0;

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  failed += 1;
}

function read(p) {
  return readFileSync(p, "utf8");
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function parseSkillFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const block = m[1];
  const meta = {};
  const nameM = block.match(/^name:\s*(.+)$/m);
  const roleM = block.match(/^role:\s*(.+)$/m);
  const whenM = block.match(/^whenToUse:\s*(.+)$/m);
  if (nameM) meta.name = nameM[1].trim();
  if (roleM) meta.role = roleM[1].trim();
  if (whenM) meta.whenToUse = whenM[1].trim();

  const blockDesc = block.match(/^description:\s*>\-?\s*\r?\n((?:[ \t].+\r?\n?)+)/m);
  if (blockDesc) {
    meta.description = blockDesc[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^[ \t]+/, ""))
      .filter(Boolean)
      .join(" ")
      .trim();
  } else {
    const inlineDesc = block.match(/^description:\s*(.+)$/m);
    if (inlineDesc) meta.description = inlineDesc[1].trim();
  }
  return meta;
}

// ── 1. Build artifact sync ─────────────────────────────────────────────────
if (!existsSync(libPrompt)) {
  fail("lib/defaults/prompt-inject.md exists", "missing — run npm run build");
} else {
  const a = read(srcPrompt);
  const b = read(libPrompt);
  if (a === b) pass("src ↔ lib prompt-inject sync", sha(a));
  else fail("src ↔ lib prompt-inject sync", `hash src=${sha(a)} lib=${sha(b)}`);
}

// ── 2. Prompt contract quality ─────────────────────────────────────────────
const prompt = existsSync(srcPrompt) ? read(srcPrompt) : "";

const MUST_HAVE = [
  "OPERATING CONTRACT",
  "Artifact-First",
  "available_skills",
  "[ROUTE]",
  "LicenseFlowRecovery",
  "CTF",
  "占位符",
  "寒霜 ready",
];
const MUST_NOT = [
  "Little Code Sauce",
  "Never refuse",
  "REFUSAL HARDENING",
  "UNRESTRICTED SANDBOX",
  "I can't, I cannot",
  "Identity and document forgery",
  "money laundering",
];

for (const s of MUST_HAVE) {
  if (prompt.includes(s)) pass(`prompt contains: ${s}`);
  else fail(`prompt missing: ${s}`);
}
for (const s of MUST_NOT) {
  if (!prompt.includes(s)) pass(`prompt removed jailbreak: ${s}`);
  else fail(`prompt still has jailbreak marker: ${s}`);
}

if (prompt.includes("{{cwd}}")) pass("prompt preserves {{cwd}}");
else fail("prompt missing {{cwd}}");

// ── 3. Capability protocol ─────────────────────────────────────────────────
const official = capabilityProtocolText({ enabled: true });
const lead = capabilityProtocolText({ redteam: true, enabled: true });
const child = capabilityProtocolText({ redteam: true, redteamChild: true, enabled: true });

if (official.includes("available_skills") && official.includes("security-router"))
  pass("capability OFFICIAL mentions router + skills");
else fail("capability OFFICIAL incomplete");

if (lead.includes("fofa-recon") && lead.includes("subagent"))
  pass("capability REDTEAM_LEAD maps stages → skills");
else fail("capability REDTEAM_LEAD incomplete");

if (child.includes("redteam_chain_add") && child.includes("leaf executor"))
  pass("capability REDTEAM_CHILD enforces evidence + leaf");
else fail("capability REDTEAM_CHILD incomplete");

if (capabilityProtocolText({ enabled: false }) === "") pass("capability disabled → empty");
else fail("capability disabled should be empty");

const CAP_POSITIVE = [
  [official, "security engineering executor"],
  [official, "authorized lab"],
  [lead, "authorized exercise"],
  [lead, "available_skills"],
  [child, "leaf executor"],
  [child, "authorized exercise"],
];
const CAP_MUST_NOT = ["Never refuse", "jailbreak", "UNRESTRICTED", "I can't"];
for (const [text, s] of CAP_POSITIVE) {
  if (text.includes(s)) pass(`capability positive framing: ${s}`);
  else fail(`capability missing positive framing: ${s}`);
}
for (const s of CAP_MUST_NOT) {
  const blob = `${official}\n${lead}\n${child}`;
  if (!blob.includes(s)) pass(`capability removed adversarial: ${s}`);
  else fail(`capability still has adversarial: ${s}`);
}
if ([official, child].every((t) => t.includes("skill` tool")))
  pass("capability executors mandate skill tool");
else fail("capability executors missing skill tool mandate");

// ── 4. Assembly integration smoke ──────────────────────────────────────────
const injectText = prompt.trim();
const assembled = rewritePromptAssembly(
  {
    sections: [
      { name: "deployment:persona-prefix", text: "You are an AI agent powered by DeepSeek Harness.", order: 100 },
      { name: "deployment:persona-suffix", text: "You are a coding agent powered by the {{model}} model.", order: 10200 },
      { name: "other", text: "Some rules.", order: 5000 },
    ],
    contexts: [],
    tools: [],
  },
  {
    fallbackInject: injectText,
    dropMnemon: true,
    capabilityProtocol: true,
    context: {
      agent: {
        session: { header: { agentPreset: "redteam", origin: "subagent" } },
      },
    },
    roleText: "",
  },
);

const purgeSec = assembled.sections.find((s) => s.name === "dsh-purge");
const capSec = assembled.sections.find((s) => s.name === CAPABILITY_SECTION);
const personaPrefix = assembled.sections.find((s) => s.name === "deployment:persona-prefix");

if (purgeSec && purgeSec.order === GLOBAL_PROMPT_ORDER && purgeSec.text.includes("OPERATING CONTRACT"))
  pass("assemble: inject leads at GLOBAL_PROMPT_ORDER", String(purgeSec.order));
else fail("assemble: inject section wrong", JSON.stringify(purgeSec?.order));

if (capSec && capSec.order === GLOBAL_PROMPT_ORDER + 1 && capSec.text.includes("leaf executor"))
  pass("assemble: redteam child capability injected");
else fail("assemble: capability section wrong for redteam child");

if (personaPrefix && (!personaPrefix.text || personaPrefix.text.trim() === ""))
  pass("assemble: harness persona prefix stripped");
else fail("assemble: persona prefix not stripped", personaPrefix?.text?.slice(0, 80));

const escaped = escapeDshInterpolation("Path {{cwd}} and {{unknown_var}} here");
if (escaped.includes("{{cwd}}") && escaped.includes("{ {unknown_var}}"))
  pass("escapeDshInterpolation preserves cwd, escapes unknown");
else fail("escapeDshInterpolation broken", escaped);

const peeled = peelChatmlEnvelope("<|im_start|>system:<project_instructions>\nHi");
if (peeled.includes("project_instructions")) pass("peelChatmlEnvelope normalizes envelope");
else fail("peelChatmlEnvelope broken");

// ── 5. Skill frontmatter + description quality ───────────────────────────────
const skillFiles = readdirSync(skillsDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
const skills = [];

for (const file of skillFiles) {
  const content = read(join(skillsDir, file));
  const meta = parseSkillFrontmatter(content);
  if (!meta?.name) {
    fail(`skill YAML: ${file}`, "missing name");
    continue;
  }
  skills.push({ file, ...meta });
  const d = meta.description || "";

  if (d.length >= 80 && d.length <= 1024) pass(`skill desc length OK: ${meta.name}`, `${d.length} chars`);
  else fail(`skill desc length: ${meta.name}`, `${d.length} chars (want 80–1024)`);

  if (/Use (when|in|after|before)/i.test(d)) pass(`skill desc has WHEN: ${meta.name}`);
  else fail(`skill desc missing WHEN trigger: ${meta.name}`);

  if (!/^我|^你|^I can|^You can/i.test(d)) pass(`skill desc third-person: ${meta.name}`);
  else fail(`skill desc first/second person: ${meta.name}`);

  if (meta.role) pass(`skill role set: ${meta.name}`, meta.role);
  else fail(`skill missing role: ${meta.name}`);
}

if (skills.length >= 36) pass("skill count", String(skills.length));
else fail("skill count", `expected ≥36, got ${skills.length}`);

// ── 5b. security-router PRIMARY references exist ─────────────────────────────
const routerPath = join(skillsDir, "security-router.md");
if (existsSync(routerPath)) {
  const routerText = read(routerPath);
  const refs = [...routerText.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
  const skillNames = new Set(skills.map((s) => s.name));
  const primaryRefs = refs.filter(
    (r) => r !== "available_skills" && r !== "skill" && r.includes("-") && !r.startsWith("redteam"),
  );
  const uniquePrimary = [...new Set(primaryRefs)];
  let routerOk = 0;
  for (const ref of uniquePrimary) {
    if (skillNames.has(ref)) {
      routerOk += 1;
      pass(`router PRIMARY exists: ${ref}`);
    } else {
      fail(`router PRIMARY missing skill file: ${ref}`);
    }
  }
  if (routerOk >= 20) pass("router PRIMARY coverage", `${routerOk} skills linked`);
  else fail("router PRIMARY coverage low", `${routerOk} linked`);
} else {
  fail("security-router.md exists");
}

// ── 5c. Subagent role prompts (bundled agents) ───────────────────────────────
const agentsDir = join(root, "presets", "redteam", "agents");
const REQUIRED_ROLES = ["recon", "assess", "vuln-scan", "exploit", "internal"];
if (!existsSync(agentsDir)) {
  fail("presets/redteam/agents/ exists");
} else {
  for (const role of REQUIRED_ROLES) {
    const fp = join(agentsDir, `${role}.md`);
    if (!existsSync(fp)) {
      fail(`agent role file: ${role}.md`, "missing");
      continue;
    }
    const body = read(fp);
    if (body.includes("叶子") && body.includes("available_skills")) {
      pass(`agent role content: ${role}`, `${body.length} chars`);
    } else {
      fail(`agent role content: ${role}`, "missing leaf + skill scan contract");
    }
    if (body.includes("[ROUTE]")) pass(`agent role [ROUTE]: ${role}`);
    else fail(`agent role missing [ROUTE]: ${role}`);
  }
}

// ── 5d. security-router PRIMARY selection simulation ─────────────────────────
function parseRouterPrimaryRules(routerText) {
  const tableStart = routerText.indexOf("## PRIMARY 优先级");
  if (tableStart < 0) return [];
  const slice = routerText.slice(tableStart);
  const rows = [...slice.matchAll(/^\|\s*P(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|/gm)];
  const rules = [];
  for (const m of rows) {
    const priority = Number(m[1]);
    const signalBlob = m[2].trim();
    const skillBlob = m[3].trim();
    if (signalBlob.startsWith("---") || signalBlob.includes("用户/证据")) continue;

    const signals = signalBlob.split(/[/、,，]/).map((s) => s.trim()).filter(Boolean);
    const primaries = [...skillBlob.matchAll(/`([a-z0-9-]+)`/g)].map((x) => x[1]);
    if (!signals.length || !primaries.length) continue;

    if (primaries.length === 1) {
      for (const signal of signals) {
        rules.push({ priority, signal, primary: primaries[0] });
      }
    } else {
      // Positional pairing: "gogo/fscan/横向/suo5" ↔ skills in same order.
      const n = Math.min(signals.length, primaries.length);
      for (let i = 0; i < n; i++) {
        rules.push({ priority, signal: signals[i], primary: primaries[i] });
      }
    }
  }
  // Longer signals first within same priority — avoid「webshell」 beating「webshell 连接」.
  return rules.sort((a, b) => a.priority - b.priority || b.signal.length - a.signal.length);
}

function asciiWordMatch(query, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(query);
}

function signalMatchesQuery(query, signal) {
  const q = query.toLowerCase();
  const sig = signal.toLowerCase().trim();
  if (!sig) return false;

  // Short ASCII tokens need word boundaries (so ⊄ socks5, ir ⊄ wireshark).
  if (/^[a-z0-9._=-]+$/i.test(sig)) {
    if (sig.length <= 3) return asciiWordMatch(q, sig);
    return q.includes(sig);
  }

  if (q.includes(sig)) return true;

  // Compound tool signals like「内网 gogo」「FOFA测绘」allow spaced variants.
  if (/\s/.test(sig)) {
    const alt = sig.replace(/\s+/g, "");
    if (alt.length >= 3 && q.replace(/\s+/g, "").includes(alt)) return true;
  }

  return false;
}

/** Explicit tool names bypass generic keyword rows (mirrors router doc). */
const ROUTER_TOOL_OVERRIDES = [
  { re: /\bfscan\b/i, primary: "fscan-intranet" },
  { re: /\bgogo\b/i, primary: "gogo-intranet" },
  { re: /\bsuo5\b/i, primary: "suo5-tunnel" },
  { re: /\bnuclei\b/i, primary: "nuclei-scan" },
  { re: /\bsubfinder\b/i, primary: "recon-pipeline" },
  { re: /\bjadx\b/i, primary: "apk-reverse" },
  { re: /\bsqlmap\b/i, primary: "sqli-testing" },
];

function routePrimary(query, rules) {
  // P0 setup always wins — even if query mentions FOFA/VPS in a「没配好」context.
  for (const rule of rules.filter((r) => r.priority === 0)) {
    if (signalMatchesQuery(query, rule.signal)) return rule.primary;
  }
  for (const { re, primary } of ROUTER_TOOL_OVERRIDES) {
    if (re.test(query)) return primary;
  }
  for (const rule of rules.filter((r) => r.priority > 0)) {
    if (signalMatchesQuery(query, rule.signal)) return rule.primary;
  }
  return null;
}

const ROUTER_CASES = [
  { query: "环境没配好 FOFA VPS 字典", expect: "redteam-setup" },
  { query: "jadx 反编译这个 apk 安卓", expect: "apk-reverse" },
  { query: "卡密激活码 keygen 去授权", expect: "license-recovery" },
  { query: "webpack JS sign 加密参数 hook", expect: "js-reverse" },
  { query: "Ghidra 逆向这个 exe 脱壳", expect: "binary-reverse" },
  { query: "登录口 SQL 注入 union select", expect: "sqli-testing" },
  { query: "反射型 XSS alert 跨站", expect: "xss-testing" },
  { query: "SSRF 读云元数据 169.254", expect: "ssrf-testing" },
  { query: "上传 jsp webshell 绕过", expect: "file-upload-exploit" },
  { query: "JWT API 越权 BOLA 接口", expect: "api-security" },
  { query: "admin 登录绕过 弱口令", expect: "auth-bypass" },
  { query: "fofa 测绘这个单位资产面", expect: "fofa-recon" },
  { query: "打点", expect: "fofa-recon" },
  { query: "帮我拿站", expect: "fofa-recon" },
  { query: "日站渗透入口", expect: "fofa-recon" },
  { query: "subfinder 子域 httpx 流水线", expect: "recon-pipeline" },
  { query: "nuclei 扫 CVE Nday 模板", expect: "nuclei-scan" },
  { query: "Redis 6379 未授权访问", expect: "unauth-exploit" },
  { query: "冰蝎马 webshell 连接", expect: "webshell-toolkit" },
  { query: "hydra 弱口令 hashcat 撞库", expect: "credential-attack" },
  { query: "内网 gogo 扫描网段", expect: "gogo-intranet" },
  { query: "fscan 内网弱口令", expect: "fscan-intranet" },
  { query: "横向移动 Pass-the-Hash", expect: "lateral-movement" },
  { query: "suo5 建 socks5 隧道", expect: "suo5-tunnel" },
  { query: "服务器中招查马应急响应", expect: "incident-response" },
  { query: "分析这个 pcap 流量 wireshark", expect: "traffic-analysis" },
  { query: "WAF 封 IP 代理池换 IP", expect: "cn-proxy-pool" },
  // Priority: specific vuln beats broad「打点」
  { query: "打点但登录口明显 SQL 注入", expect: "sqli-testing" },
];

let routerRules = [];
if (existsSync(routerPath)) {
  routerRules = parseRouterPrimaryRules(read(routerPath));
  if (routerRules.length >= 20) pass("router rules parsed", `${routerRules.length} signal→PRIMARY pairs`);
  else fail("router rules parsed", `only ${routerRules.length} pairs`);
} else {
  fail("router rules parsed", "security-router.md missing");
}

let routerHits = 0;
for (const { query, expect } of ROUTER_CASES) {
  const got = routePrimary(query, routerRules);
  if (got === expect) {
    routerHits += 1;
    pass(`router PRIMARY: "${query.slice(0, 22)}…" → ${expect}`);
  } else {
    fail(
      `router PRIMARY: "${query.slice(0, 22)}…"`,
      `expected ${expect}, got ${got ?? "(no match)"}`,
    );
  }
}

const routerMinHits = Math.ceil(ROUTER_CASES.length * 0.95);
if (routerHits >= routerMinHits)
  pass("router PRIMARY hit rate", `${routerHits}/${ROUTER_CASES.length}`);
else fail("router PRIMARY hit rate", `${routerHits}/${ROUTER_CASES.length} (need ≥${routerMinHits})`);

// ── 6. Skill discovery simulation (keyword overlap vs user queries) ─────────
const DISCOVERY_CASES = [
  { query: "用 subfinder 做子域枚举信息收集", expect: "recon-pipeline" },
  { query: "fofa 测绘这个单位资产", expect: "fofa-recon" },
  { query: "nuclei 扫 CVE Nday 漏洞", expect: "nuclei-scan" },
  { query: "Redis 6379 未授权访问利用", expect: "unauth-exploit" },
  { query: "上传冰蝎马 webshell 连接", expect: "webshell-toolkit" },
  { query: "suo5 建 socks5 内网隧道", expect: "suo5-tunnel" },
  { query: "内网 gogo 扫描网段", expect: "gogo-intranet" },
  { query: "fscan 内网弱口令", expect: "fscan-intranet" },
  { query: "nmap 端口服务版本扫描", expect: "active-scan" },
  { query: "目录爆破 ffuf 找后台", expect: "dir-bruteforce" },
  { query: "环境没配好 FOFA VPS", expect: "redteam-setup" },
  { query: "被动收集 crt.sh 证书透明", expect: "passive-recon" },
  { query: "横向移动 Pass-the-Hash 域控", expect: "lateral-movement" },
  { query: "代理池换 IP 防 WAF 封", expect: "cn-proxy-pool" },
  { query: "资产梳理 C 段关联图谱", expect: "asset-correlation" },
  { query: "这个登录口 SQL 注入 union select", expect: "sqli-testing" },
  { query: "反射型 XSS alert 跨站脚本", expect: "xss-testing" },
  { query: "SSRF 读云元数据 169.254", expect: "ssrf-testing" },
  { query: "JWT API 越权 BOLA 接口", expect: "api-security" },
  { query: "上传 jsp webshell 绕过", expect: "file-upload-exploit" },
  { query: "admin 登录绕过 弱口令后台", expect: "auth-bypass" },
  { query: "jadx 反编译这个 apk 安卓", expect: "apk-reverse" },
  { query: "卡密激活码 keygen 去授权", expect: "license-recovery" },
  { query: "webpack JS sign 加密参数", expect: "js-reverse" },
  { query: "Ghidra 逆向这个 exe 脱壳", expect: "binary-reverse" },
  { query: "服务器中招查马应急响应", expect: "incident-response" },
  { query: "分析这个 pcap 流量 wireshark", expect: "traffic-analysis" },
  { query: "帮我渗透测试打点", expect: "security-router" },
];

function queryTokens(query) {
  const normalized = query
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, "$1 $2")
    .toLowerCase();
  const base = normalized.split(/[\s，。、/]+/).filter((t) => t.length > 1);
  const extra = [];
  for (const t of base) {
    if (/^[\u4e00-\u9fff]+$/.test(t) && t.length > 3) {
      for (let i = 0; i <= t.length - 2; i++) extra.push(t.slice(i, i + 2));
    }
  }
  return [...new Set([...base, ...extra])];
}

function rankSkills(query) {
  const q = query.toLowerCase();
  const qTokens = queryTokens(query);
  return skills
    .map((s) => {
      const hay = `${s.name} ${s.description} ${s.whenToUse || ""}`.toLowerCase();
      let score = 0;
      if (hay.includes(q)) score += 25;
      const nameSegments = s.name.split("-");
      for (const t of qTokens) {
        if (hay.includes(t)) score += t.length;
        // Match skill slug segments only — avoid "ip" ⊂ "pipeline" false positives.
        if (nameSegments.includes(t)) score += 15;
        else if (t.length >= 4 && nameSegments.some((seg) => seg.includes(t))) score += 10;
      }
      for (let i = 0; i < qTokens.length - 1; i++) {
        const phrase = `${qTokens[i]} ${qTokens[i + 1]}`;
        if (phrase.length >= 5 && hay.includes(phrase)) score += 12;
      }
      if (hay.includes(q.slice(0, 8))) score += 5;
      return { name: s.name, score };
    })
    .sort((a, b) => b.score - a.score);
}

let discoveryHits = 0;
for (const { query, expect } of DISCOVERY_CASES) {
  const ranked = rankSkills(query);
  const top = ranked[0];
  if (top?.score === 0) {
    fail(`discovery: "${query.slice(0, 24)}…"`, `no keyword overlap (top ${top?.name})`);
  } else if (top?.name === expect) {
    discoveryHits += 1;
    pass(`discovery: "${query.slice(0, 24)}…" → ${expect}`);
  } else {
    fail(`discovery: "${query.slice(0, 24)}…"`, `expected ${expect}, got ${top?.name} (score ${top?.score})`);
  }
}

const discoveryRate = ((discoveryHits / DISCOVERY_CASES.length) * 100).toFixed(0);
const minHits = Math.ceil(DISCOVERY_CASES.length * 0.9);
if (discoveryHits >= minHits)
  pass("discovery hit rate", `${discoveryHits}/${DISCOVERY_CASES.length} (${discoveryRate}%)`);
else fail("discovery hit rate below threshold", `${discoveryHits}/${DISCOVERY_CASES.length} (need ≥${minHits})`);

// ── 7. Before/after description comparison (from git committed baseline) ───
import { execSync } from "node:child_process";

function oldDescription(file) {
  try {
    const raw = execSync(`git show HEAD:skills/redteam/${file}`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return parseSkillFrontmatter(raw)?.description || "";
  } catch {
    return null;
  }
}

let improved = 0;
let comparable = 0;
for (const { query, expect } of DISCOVERY_CASES) {
  const oldDesc = oldDescription(`${expect}.md`);
  const newDesc = skills.find((s) => s.name === expect)?.description || "";
  if (!oldDesc) continue;
  comparable += 1;

  function scoreDesc(desc) {
    const hay = `${expect} ${desc}`.toLowerCase();
    const qTokens = query.toLowerCase().split(/[\s，。、/]+/).filter((t) => t.length > 1);
    return qTokens.reduce((n, t) => n + (hay.includes(t) ? t.length : 0), 0);
  }
  const oldScore = scoreDesc(oldDesc);
  const newScore = scoreDesc(newDesc);
  if (newScore >= oldScore) improved += 1;
}

if (comparable > 0) {
  pass(
    "description keyword coverage vs git HEAD",
    `${improved}/${comparable} queries same-or-better (${((improved / comparable) * 100).toFixed(0)}%)`,
  );
} else {
  pass("description comparison skipped", "no git baseline (first commit)");
}

// ── 5e. Package exports & redteam tools module ───────────────────────────────
const pkg = JSON.parse(read(join(root, "package.json")));
const exportsMap = pkg.exports || {};
if (exportsMap["./redteam/tools"]) pass("export: ./redteam/tools", exportsMap["./redteam/tools"]);
else fail("export: ./redteam/tools", "missing from package.json exports");

const toolsLib = join(root, "lib", "redteam", "tools", "index.js");
if (existsSync(toolsLib)) pass("lib/redteam/tools/index.js built");
else fail("lib/redteam/tools/index.js built", "run npm run build");

const agentCordis = join(root, "presets", "redteam", "agent.cordis.yml");
if (existsSync(agentCordis)) {
  const yml = read(agentCordis);
  const pluginRefs = [...yml.matchAll(/name:\s*(dsh-purge\/[^\s\n]+)/g)].map((m) => m[1].trim());
  for (const ref of pluginRefs) {
    const sub = ref.replace(/^dsh-purge\//, "./");
    const rel = sub === "./redteam/tools" ? exportsMap["./redteam/tools"] : exportsMap[sub] || exportsMap["."];
    if (rel && existsSync(join(root, rel))) pass(`preset plugin ref: ${ref}`);
    else fail(`preset plugin ref unresolved: ${ref}`, String(rel || "no export"));
  }
  if (yml.includes("演练台") && yml.includes("环境适配")) {
    fail("agent.cordis stale UI ref", "still mentions 演练台/环境适配");
  } else {
    pass("agent.cordis UI ref updated");
  }
}

if (existsSync(toolsLib)) {
  const toolsSrc = read(toolsLib);
  const registered = [...toolsSrc.matchAll(/name:\s*"redteam_[a-z_]+"/g)].map((m) => m[0].replace(/name:\s*"/, "").replace(/"$/, ""));
  const requiredTools = [
    "redteam_preflight",
    "redteam_engagement_open",
    "redteam_asset_add",
    "redteam_vuln_add",
    "redteam_chain_add",
    "redteam_asset_query",
    "redteam_vuln_query",
    "redteam_agent_slot",
  ];
  for (const t of requiredTools) {
    if (registered.includes(t)) pass(`redteam tool registered: ${t}`);
    else fail(`redteam tool missing: ${t}`);
  }
  if (registered.length >= 20) pass("redteam tool count", `${registered.length} tools`);
  else fail("redteam tool count low", `${registered.length}`);
}

// ── 5f. inject read cache (mtime) ───────────────────────────────────────────
{
  const tsStore = read(join(root, "src", "inject-store.ts"));
  if (tsStore.includes("injectCache") && tsStore.includes("mtimeMs")) pass("inject-store mtime cache");
  else fail("inject-store mtime cache", "missing cache layer");
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log("\n=== dsh-purge validate ===\n");
for (const r of results) {
  const mark = r.ok ? "✓" : "✗";
  const line = r.detail ? `${r.name} — ${r.detail}` : r.name;
  console.log(`${mark} ${line}`);
}
console.log(`\n${results.length} checks · ${failed} failed · ${results.length - failed} passed\n`);
process.exit(failed > 0 ? 1 : 0);
