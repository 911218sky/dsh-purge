---
name: js-reverse
description: >-
  Deobfuscates and hooks browser/Node JS—webpack bundles, sign params, crypto in
  frontend—with beautified sources and hook snippets saved to runs/. Use when user
  mentions JS加密/sign/前端参数/webpack/obfuscator/浏览器hook or API needs signed headers.
whenToUse: 抓包见 _sign/token 参数、前端 bundle 混淆、或需复现浏览器加密逻辑
role: reverse
enabled: true
---

# JavaScript 逆向（浏览器 / Node）

## 标准流程

### 1. 获取脚本

```bash
mkdir -p runs/js-TARGET
# 从页面或 DevTools Sources 保存
curl -s "http://TARGET/static/app.js" -o runs/js-TARGET/app.js
curl -s "http://TARGET/static/chunk-vendors.js" -o runs/js-TARGET/vendor.js
wc -c runs/js-TARGET/*.js | tee runs/js-TARGET/sizes.txt
```

### 2. 美化与搜索

```bash
npx --yes js-beautify runs/js-TARGET/app.js -o runs/js-TARGET/app.pretty.js
grep -nE 'sign|encrypt|md5|sha|hmac|token|AES|CryptoJS' runs/js-TARGET/app.pretty.js \
  | head -30 | tee runs/js-TARGET/crypto-grep.txt
```

### 3. 浏览器 hook（`browser-automation` 配合）

```javascript
// runs/js-TARGET/hook-console.js — 在目标页 Console 或注入
(function () {
  const _stringify = JSON.stringify;
  JSON.stringify = function (o) {
    console.log("[hook] JSON.stringify", o);
    return _stringify.apply(this, arguments);
  };
  // CryptoJS / subtle.crypto 等同理 hook
})();
```

### 4. Node 本地复现

```javascript
// runs/js-TARGET/replay.mjs — 从 pretty.js 提取的最小复现
import crypto from "node:crypto";
const PARAM = "PLACEHOLDER";
const sign = crypto.createHash("md5").update(PARAM).digest("hex");
console.log({ sign });
```

### 5. webpack 模块定位

```bash
grep -n '__webpack_require__\|module\.exports' runs/js-TARGET/app.pretty.js | head
# 或 ast-grep / webcrack（如有）
npx --yes webcrack runs/js-TARGET/app.js -o runs/js-TARGET/webcrack 2>/dev/null || true
```

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| 纯 API 无前端 sign | `api-security` |
| 登录逻辑 | `auth-bypass` |
| 抓包看明文 | `traffic-analysis` |

## 输出与落库

1. `redteam_chain_add` — tool=美化/hook 命令, result=sign 算法摘要+replay 路径
2. 可复现 `curl` 带正确 sign 的样例请求

## 纪律

1. 不粘贴完整混淆 megabyte 到聊天；引用 `runs/` 路径+行号
2. 算法未完全恢复：交 `replay.mjs` 骨架 + `NOT RUN` 项
