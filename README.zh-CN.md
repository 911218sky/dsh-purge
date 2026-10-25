# dsh-purge 2.0

DeepSeek Harness **Web** 插件：通过官方 Cordis `systemPrompt` API 注入自定义系统提示词，并附带精简红队预设 / 技能落地。

> English: [README.md](README.md)

## 2.x 相对 1.x 的变化

| 1.x | 2.x |
|-----|-----|
| 改宿主磁盘 / ASAR / 桌面 EXE | **纯 Cordis 运行时**，不再打宿主补丁 |
| 桌面 + Web | **仅 Web profile**（`dsh web`） |
| 大量 JS / 红队存储 | TypeScript（`strict`）· 精简 `presets` / `skills` |
| 兼容 0.1.5 | 面向 **DSH ≥ 0.2.1**（`< 0.3.0`） |

## 环境要求

- Node.js ≥ 20
- DeepSeek Harness **≥ 0.2.1**（Web）
- 安装到 `$DSH_HOME/profiles/web`

## 工作原理

```text
$DSH_HOME/prompt-inject.md          ← 真正生效的提示词（改这个）
        │
        ▼
dsh-purge（Cordis）
  · systemPrompt.section("dsh-purge")     以 order -100000 注入
  · systemPrompt.variable("cwd")          兼容 0.2.1+ 的 {{cwd}}
  · system-prompt/assemble 瀑布钩子       去掉官方身份文案、写入 cwd
  · GET/POST /dsh-purge/*                 状态与编辑 API
  · 侧栏 UI（client）                     浏览器里改提示词
```

**提示词生命周期**

1. 插件启动时，若 `$DSH_HOME/prompt-inject.md` 不存在或为空，则用打包默认值填充（`src/defaults/prompt-inject.md`，构建时复制到 `lib/defaults/`）。
2. 每次对话组装 system prompt 时读取该文件并注入。
3. 修改方式：侧栏 **dsh-purge**、`POST /dsh-purge/prompt`，或直接改磁盘文件（下次 assemble 生效）。

**路径别搞混：** `D:\DSH\plugins\dsh-api-key-pool` 是另一个插件。本仓库源码在 `src/`（例如本机开发目录 `D:\DSH\.work\dsh-purge\src`）。

## 安装

写入 Web profile（Windows 示例）：

```bash
cd %DSH_HOME%\profiles\web
# 或: cd D:\DSH\.dsh\profiles\web

npm install https://github.com/911218sky/dsh-purge/archive/refs/heads/master.tar.gz
```

确认 `package.json` → `dsh.profile.bundles` 里有 `dsh-purge`，然后重启：

```bash
dsh web
```

`cordis.patch.yml` 会通过 `package.json` → `dsh.bundle.patch` 自动应用，作用包括：

- 关掉本插件替代的独立 `dsh-redteam-*` 包
- `includeHarnessIdentity: false`，`personaSuffix` 只保留 cwd 说明
- 插入 `dsh-purge` 与 `dsh-purge/redteam`

### 验证

```bash
curl http://127.0.0.1:3081/dsh-purge/status
```

期望大致为：

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

会话里也可调用工具 `purge_status`。

## 开发

```bash
git clone https://github.com/911218sky/dsh-purge.git
cd dsh-purge
npm install
npm run typecheck
npm run build
```

构建产出 ESM（`lib/index.js`、`lib/redteam/`）与浏览器端（`lib/client.js`），并复制默认提示词到 `lib/defaults/`。

本地联调（链到 Web profile）：

```bash
cd %DSH_HOME%\profiles\web
npm install file:D:/DSH/.work/dsh-purge
# 重启 dsh web
```

## 目录结构

```text
src/
  index.ts              插件入口（section / assemble / tools / routes）
  identity.ts           组装改写 · {{cwd}} · 去掉官方 persona
  inject-store.ts       读写 / 种子 prompt-inject.md
  capability.ts         可选 capability 协议段
  web/routes.ts         /dsh-purge/status · /dsh-purge/prompt
  client/index.tsx      侧栏 UI
  redteam/              预设/技能同步 + 子代理角色段
  defaults/prompt-inject.md   打包种子（仅缺文件时用）
lib/                    编译产物（不要手改）
cordis.patch.yml        Web Cordis 补丁
presets/ · skills/      红队 preset + 36 技能 + security-router + 5 子代理角色稿
```

## 配置（`cordis.patch.yml`）

| 字段 | 默认 | 含义 |
|------|------|------|
| `enabled` | `true` | 总开关 |
| `stripMnemon` | `true` | 在 `agent/pre-step` 去掉 mnemon 消息 |
| `verbose` | `false` | 控制台日志 |
| `postPrompt` | `""` | 主注入之后的额外段 |
| `postPromptOrder` | `5100` | `postPrompt` 的 order（须 > `-100000`） |
| `capabilityProtocol` | `true` | 注册 capability 协议段 |

## HTTP API

| 方法 | 路径 | 作用 |
|------|------|------|
| `GET` | `/dsh-purge/status` | 运行状态 |
| `GET` | `/dsh-purge/prompt` | 读取当前注入文本 |
| `POST` | `/dsh-purge/prompt` | Body `{ "text": "..." }` 保存 |

仅同源 / localhost。

## License

MIT
