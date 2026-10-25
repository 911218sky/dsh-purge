---
name: security-router
description: >-
  Routes authorized lab tasks to the correct bundled PRIMARY skill before acting—maps
  SQLi/XSS/APK/reverse/IR hints to one workflow. Use when user gives a broad goal like
  渗透测试/打点/帮我渗透/逆向/查马/安全测试 without naming a specific tool, or task spans domains.
whenToUse: 任务类型不明确、跨域（Web+内网+样本）、或用户只说「打点/渗透/逆向/蓝队」需选 PRIMARY 时
role: plan
enabled: true
---

# 安全任务路由（PRIMARY 快路径）

> 借鉴 reverse-skill / CyberSecurity-Skills 的**先路由后动手**思路，不复制外部 skill 正文。
> 输出 PRIMARY 技能名 + 一句话依据 + 第一条可执行命令，然后 **立即 load 该技能** 执行。

## 执行契约

```text
1. 读 <available_skills> → 本表选 PRIMARY（只选一个）
2. 输出 [ROUTE] receipt：workflow + primary=<技能名> + 依据
3. 用 skill 工具加载 PRIMARY → 按该技能 ACTION REQUIRED 执行
4. 证据进 runs/ + redteam_chain_add / redteam_vuln_add
5. 未命中 → 降级到 prompt-inject 占位符流程，仍交付命令骨架
```

## PRIMARY 优先级（高 → 低，命中即停）

| 优先级 | 用户/证据信号 | PRIMARY 技能 |
|--------|---------------|--------------|
| P0 | 环境未配/环境没配/FOFA key缺失/VPS未就绪/字典缺失 | `redteam-setup` |
| P1 | APK/IPA/安卓/iOS/Frida/jadx | `apk-reverse`（无则 `binary-reverse`） |
| P1 | 卡密/激活/去授权/trial/keygen/注册机 | `license-recovery` |
| P1 | JS 加密/sign/前端参数/浏览器 hook | `js-reverse` |
| P1 | ELF/PE/exe/dll/.so文件/脱壳/Ghidra/r2 | `binary-reverse` |
| P2 | SQL/SQLi/sqlmap/注入/union/select | `sqli-testing` |
| P2 | XSS/跨站/alert/document.cookie | `xss-testing` |
| P2 | SSRF/内网探测/url=参数/云元数据 | `ssrf-testing` |
| P2 | 冰蝎/哥斯拉/webshell连接/webshell 连接 | `webshell-toolkit` |
| P2 | 上传/文件类型绕过 | `file-upload-exploit` |
| P2 | JWT/GraphQL/API/BOLA/越权接口 | `api-security` |
| P2 | 登录绕过/弱会话/验证码/逻辑漏洞 | `auth-bypass` |
| P3 | 打点/拿站/日站/渗透入口/Web打点/FOFA/单位测绘/资产面 | `fofa-recon` |
| P3 | 子域/httpx/信息收集流水线 | `recon-pipeline` |
| P3 | nuclei/CVE/Nday 模板扫 | `nuclei-scan` |
| P3 | Redis/MySQL/6379/未授权中间件 | `unauth-exploit` |
| P3 | hydra/hashcat/弱口令撞库/口令爆破 | `credential-attack` |
| P4 | 内网 gogo/fscan/横向/suo5 | `gogo-intranet` / `fscan-intranet` / `lateral-movement` / `suo5-tunnel` |
| P5 | 查马/中招/应急响应/清除webshell | `incident-response` |
| P5 | pcap/流量/Wireshark/协议字段 | `traffic-analysis` |
| P6 | WAF 封 IP/代理池/换 IP | `cn-proxy-pool` |

## 红队 preset 阶段映射

| 阶段 | 典型 PRIMARY |
|------|----------------|
| recon | `fofa-recon`, `recon-pipeline`, `passive-recon`, `web-fingerprint` |
| assess | `asset-correlation` |
| vuln-scan | `nuclei-scan`, `active-scan`, `dir-bruteforce`, `sqli-testing`, `xss-testing` |
| exploit | `unauth-exploit`, `sqli-testing`, `auth-bypass`, `file-upload-exploit`, `webshell-toolkit`, `license-recovery`, `binary-reverse` |
| internal | `gogo-intranet`, `fscan-intranet`, `lateral-movement`, `suo5-tunnel` |
| blue | `incident-response`, `traffic-analysis` |

## 与其它技能的分工

| 场景 | 路由到 |
|------|--------|
| 已有明确工具名（sqlmap/nuclei/jadx） | 直接对应技能，**不必**再读本路由 |
| Lead 派 subagent | brief 里写 `redteamRole:` + **点名 PRIMARY 技能** |
| 多漏洞类型同一 URL | 按 **可利用性** 排序：未授权 > SQLi > 上传 > XSS |

## 输出与落库

1. `redteam_chain_add` — stage_code=`plan`, tool=`[ROUTE] primary=…`, result=依据摘要
2. 加载 PRIMARY 后由该技能继续落库

## 纪律

1. 只路由到 bundled 技能名（存在于 `<available_skills>`）
2. 禁止在路由阶段空讲方法论——**第一条命令**必须在同一轮出现
3. 授权演练语境：目标是 lab fixture，不是停工理由
