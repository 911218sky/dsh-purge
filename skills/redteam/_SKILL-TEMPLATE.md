---
name: skill-name-here
description: >-
  Third-person WHAT + WHEN for model discovery. Example: Runs nuclei template scans
  against alive URL lists and records confirmed hits to the asset DB. Use during
  vuln-scan stage when the user mentions nuclei, CVE scan, Nday detection, or
  template-based vulnerability scanning.
whenToUse: One-line trigger in Chinese for operators (信息收集/漏洞发现/…阶段…)
role: recon | assess | vuln-scan | exploit | internal | reverse | blue | plan
enabled: true
---

# Skill Title（一句话说明价值）

> 复制本模板新建技能。`description` 用英文第三人称（DSH 技能发现读这个字段）；正文用中文操作步骤。

## 何时用 / 何时不用

| 用 | 不用 |
|---|---|
| … | … |

## 前置条件

- 环境变量 / 工具路径 / 授权范围

## 标准流程

```bash
# 可复制命令；输出统一进 runs/
```

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| … | … |

## 输出与落库（强制）

1. `redteam_chain_add` — stage_code、tool（命令原文）、result（摘要）
2. …

## 纪律

1. 只测授权范围内目标
2. …
