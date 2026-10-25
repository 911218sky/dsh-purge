---
name: asset-correlation
description: >-
  Links domains, IPs, /24 segments, certs, and services into asset graph via
  redteam_asset_link. Use in assess stage after recon to prioritize targets,
  or when user mentions 资产梳理/关联/C段/图谱.
whenToUse: 信息收集阶段性收口，需要形成资产关系视图时
role: recon
enabled: true
---

## 关联规则
- 域名解析 → `resolves` 边（domain → asset）
- C 段归属 → `contains` 边（segment → asset）
- 端口开放 → `exposes` 边（asset → port）
- 证书 SAN 共享 → `shares_cert` 边

## 落库要求
通过 redteam_asset_link 写入 edge 表；重复关系幂等。
