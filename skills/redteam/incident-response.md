---
name: incident-response
description: >-
  Runs blue-team incident response—IOC hunt, timeline, persistence removal, and
  verification on compromised servers. Use when user mentions 查马/中招/服务器被黑/
  应急响应/IR/清除/webshell排查/勒索/异常进程/蓝队取证.
whenToUse: 服务器或站点疑似被入侵、需查马/清除/验证恢复时（非端口扫描）
role: blue
enabled: true
---

# 应急响应（蓝队 IR）

> 授权演练 / 本地取证 lab。先**保全证据**，再遏制，最后清除与验证。

## 标准流程

### 1. 初始 triage

```bash
mkdir -p runs/ir-HOST
date -u | tee runs/ir-HOST/timeline.txt
uname -a | tee -a runs/ir-HOST/timeline.txt
# Windows: systeminfo, whoami /all
ps auxww | tee runs/ir-HOST/ps.txt
ss -tulpn 2>/dev/null || netstat -tulpn | tee runs/ir-HOST/ports.txt
find /tmp /var/www -mtime -3 -type f 2>/dev/null | head -50 | tee runs/ir-HOST/recent-files.txt
```

### 2. IOC 狩猎

```bash
# 按用户给的 hash/IP/域名/路径
grep -rE 'eval\(|base64_decode|shell_exec|/bin/sh' /var/www 2>/dev/null \
  | head -30 | tee runs/ir-HOST/web-grep.txt
crontab -l 2>/dev/null | tee runs/ir-HOST/cron.txt
ls -la /etc/cron* 2>/dev/null | tee runs/ir-HOST/cron.d.txt
```

### 3. WebShell / 后门

```bash
find /var/www -name '*.php' -mtime -7 -exec grep -l 'eval\|assert\|$_POST' {} \; \
  2>/dev/null | tee runs/ir-HOST/suspicious-php.txt
# 对比 baseline（如有）：diff known-good vs current
```

### 4. 遏制与清除

```text
1. 隔离网络（演练环境快照/断网占位 HOST）
2. 删除/ quarantine 恶意文件 → 记录路径到 runs/ir-HOST/quarantine-list.txt
3. 重置凭据、清 session、patch 漏洞入口
4. 清 cron / systemd / 启动项
```

### 5. 验证

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://TARGET/known-good-page
grep -r 'eval(' /var/www 2>/dev/null | wc -l | tee runs/ir-HOST/post-clean-eval-count.txt
```

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| pcap/流量还原 | `traffic-analysis` |
| 攻击链复现（红队视角） | `security-router` → 对应 exploit 技能 |
| 日志里 C2 IP | `passive-recon` 关联 |

## 输出与落库

1. `redteam_chain_add` — stage_code=`blue`, tool=执行的 hunt 命令, result=IOC 列表
2. 时间线：`runs/ir-HOST/timeline.txt`（追加式）

## 纪律

1. 删除前 `cp` 到 `runs/ir-HOST/quarantine/`
2. 不覆盖原始磁盘镜像；大镜像用路径引用
3. 结论必须链到命令输出，不臆测攻击者身份
