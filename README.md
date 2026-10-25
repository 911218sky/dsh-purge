# dsh-purge 2.0

DeepSeek Harness **Web** plugin that injects a custom system prompt through official Cordis APIs, plus a slim redteam preset/skills bootstrap.

> Chinese: [README.zh-CN.md](README.zh-CN.md)

## What changed in 2.x

| 1.x | 2.x |
|-----|-----|
| Patched DSH host files / ASAR / desktop EXE | Cordis runtime only — no host disk patches |
| Desktop + Web | **Web profile only** (`dsh web`) |
| Large JS / redteam store | TypeScript (`strict`) · slim `presets` / `skills` |
| Compatible with 0.1.5 | Targets **DSH ≥ 0.2.1** (`< 0.3.0`) |

## Requirements

- Node.js ≥ 20
- DeepSeek Harness **≥ 0.2.1** (Web profile)
- Plugin installed into `$DSH_HOME/profiles/web`

## How it works

```text
$DSH_HOME/prompt-inject.md          ← live prompt (edit this)
        │
        ▼
dsh-purge (Cordis)
  · systemPrompt.section("dsh-purge")     inject at order -100000
  · systemPrompt.variable("cwd")          fix {{cwd}} on 0.2.1+
  · system-prompt/assemble waterfall      strip harness persona, stamp cwd
  · GET/POST /dsh-purge/*                 status + edit API
  · sidebar UI (client)                   edit prompt in browser
```

**Prompt lifecycle**

1. On plugin start, if `$DSH_HOME/prompt-inject.md` is missing/empty, seed from the bundled default (`src/defaults/prompt-inject.md` → copied into `lib/defaults/` at build time).
2. Every chat assembly reads that file and injects it as a system section.
3. Edit via the **dsh-purge** sidebar panel, or `POST /dsh-purge/prompt`, or edit the file on disk (takes effect on the next assemble).

**Not this repo:** `D:\DSH\plugins\dsh-api-key-pool` is a different plugin. Source for purge lives under this repository (`src/`).

## Install

Into your Web profile (example paths on Windows):

```bash
cd %DSH_HOME%\profiles\web
# or: cd D:\DSH\.dsh\profiles\web

npm install https://github.com/911218sky/dsh-purge/archive/refs/heads/master.tar.gz
```

Ensure `dsh-purge` is listed in the profile bundles (`package.json` → `dsh.profile.bundles`), then restart:

```bash
dsh web
```

`cordis.patch.yml` is applied automatically via `package.json` → `dsh.bundle.patch`. It:

- disables the standalone `dsh-redteam-*` packages this plugin replaces
- sets `includeHarnessIdentity: false` and a cwd-only `personaSuffix`
- inserts `dsh-purge` + `dsh-purge/redteam`

### Verify

```bash
curl http://127.0.0.1:3081/dsh-purge/status
```

Expected shape:

```json
{
  "ok": true,
  "version": "2.0.0",
  "mode": "cordis-runtime",
  "surface": "web",
  "override_status": "ready",
  "override_path": ".../prompt-inject.md"
}
```

In a session you can also call the `purge_status` tool.

## Develop

```bash
git clone https://github.com/911218sky/dsh-purge.git
cd dsh-purge
npm install
npm run typecheck
npm run build
```

Build outputs ESM (`lib/index.js`, `lib/redteam/`) and the browser client (`lib/client.js`), then copies `src/defaults/prompt-inject.md` → `lib/defaults/`.

Local link into the Web profile:

```bash
cd %DSH_HOME%\profiles\web
npm install file:D:/DSH/.work/dsh-purge
# restart dsh web
```

## Layout

```text
src/
  index.ts              plugin entry (sections, assemble, tools, routes)
  identity.ts           assembly rewrite · {{cwd}} · persona strip
  inject-store.ts       read/write/seed prompt-inject.md
  capability.ts         optional capability protocol section
  web/routes.ts         /dsh-purge/status · /dsh-purge/prompt
  client/index.tsx      sidebar UI
  redteam/              preset/skills sync + subagent role section
  defaults/prompt-inject.md   bundled seed (fallback only)
lib/                    build output (do not edit by hand)
cordis.patch.yml        Web profile Cordis patch
presets/ · skills/      redteam preset · 36 skills · security-router · 5 subagent role prompts
```

## Config (`cordis.patch.yml`)

| Key | Default | Meaning |
|-----|---------|---------|
| `enabled` | `true` | Master switch |
| `stripMnemon` | `true` | Drop mnemon plugin messages in `agent/pre-step` |
| `verbose` | `false` | Console logs |
| `postPrompt` | `""` | Extra section after the main inject |
| `postPromptOrder` | `5100` | Order for `postPrompt` (must be > `-100000`) |
| `capabilityProtocol` | `true` | Register capability protocol section |

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/dsh-purge/status` | Runtime status |
| `GET` | `/dsh-purge/prompt` | Read current inject text |
| `POST` | `/dsh-purge/prompt` | Body `{ "text": "..." }` — save inject |

Same-origin / localhost only.

## License

MIT
