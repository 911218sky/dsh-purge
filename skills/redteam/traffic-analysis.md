---
name: traffic-analysis
description: >-
  Parses PCAP/HTTP logs with tshark/wireshark filters—extracts credentials, C2, TLS
  SNI, and protocol fields to runs/. Use when user mentions pcap/流量/抓包/Wireshark/
  tshark/协议分析 or needs keys from captured traffic.
whenToUse: 已有 .pcap/.cap 或 proxy 导出日志，需提取字段、Follow TCP、找密钥
role: blue
enabled: true
---

# 流量分析（PCAP / HTTP）

## 标准流程

### 1. 概览

```bash
mkdir -p runs/pcap-FILE
capinfos FILE.pcap | tee runs/pcap-FILE/capinfos.txt
tshark -r FILE.pcap -q -z io,phs | tee runs/pcap-FILE/protocols.txt
tshark -r FILE.pcap -q -z conv,ip | head -30 | tee runs/pcap-FILE/top-ip.txt
```

### 2. HTTP / API

```bash
tshark -r FILE.pcap -Y 'http.request' -T fields \
  -e frame.time -e ip.src -e http.host -e http.request.uri -e http.user_agent \
  | head -50 | tee runs/pcap-FILE/http-requests.txt

tshark -r FILE.pcap -Y 'http contains "password" or http contains "token"' \
  -T fields -e http.file_data 2>/dev/null | head -20 | tee runs/pcap-FILE/http-secrets.txt
```

### 3. DNS / TLS

```bash
tshark -r FILE.pcap -Y 'dns.qry.name' -T fields -e dns.qry.name \
  | sort -u | head -50 | tee runs/pcap-FILE/dns.txt
tshark -r FILE.pcap -Y 'tls.handshake.extensions_server_name' -T fields \
  -e tls.handshake.extensions_server_name | sort -u | tee runs/pcap-FILE/sni.txt
```

### 4. 跟踪流 / 导出对象

```bash
tshark -r FILE.pcap -Y 'tcp.stream eq 0' -T fields -e data.text | head -20 \
  | tee runs/pcap-FILE/stream0.txt
# tshark --export-objects http,runs/pcap-FILE/objects
```

### 5. 过滤模板（按题面改）

```bash
# C2 beacon 间隔、特定 User-Agent、JWT in Authorization
tshark -r FILE.pcap -Y 'http.authorization contains "Bearer"' -T fields \
  -e http.authorization | head -10 | tee runs/pcap-FILE/jwt.txt
```

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| JS sign 从 HTTP body 逆 | `js-reverse` |
| 在线激活 URL | `license-recovery` |
| IR 时间线 | `incident-response` |

## 输出与落库

1. `redteam_chain_add` — tool=tshark 过滤命令, result=关键字段+流编号
2. 提取的 IOC（IP/域名/UA/hash）列表

## 纪律

1. PCAP 可能含真实凭据——只写 `runs/`，不进 git
2. 大文件先 `capinfos` 再过滤，避免全量 dump 到终端
3. 未解码的 TLS 标 `NOT RUN` + 需密钥/SSLKEYLOGFILE 的下一步
