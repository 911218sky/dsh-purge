---
name: license-recovery
description: >-
  Reverses local license/activation chains—locates check functions, builds patch
  tables, and drafts keygen/verifier skeletons with rollback notes in runs/. Use when
  user mentions 卡密/激活码/去授权/trial/keygen/注册机/试用限制 on a local sample.
whenToUse: 本地样本或 crackme 存在授权校验、序列号输入、到期/试用弹窗
role: reverse
enabled: true
---

# 授权校验链恢复（LicenseFlowRecovery）

> 本地 lab 样本 / CTF crackme。与 `binary-reverse` 共用 triage；本技能专注**校验逻辑 → patch → keygen 骨架**。

## 标准流程

### 1. 定位入口

```bash
mkdir -p runs/license-SAMPLE
file SAMPLE | tee runs/license-SAMPLE/file.txt
strings -n 6 SAMPLE | grep -iE 'license|serial|activate|trial|register|key|expired' \
  | tee runs/license-SAMPLE/strings-hit.txt
# Windows PE：也可用 findstr /i "license serial activate"
```

### 2. 静态 xref（r2 / Ghidra）

```bash
r2 -q -c 'aaa; iz~license; iz~serial; afl~check; afl~valid' SAMPLE \
  | tee runs/license-SAMPLE/r2-license.txt
```

记录：`CHECK_FN` 地址、比较方式（strcmp / 自定义算法 / 在线校验）。

### 3. Patch 表（可逆，Copy-first）

| 地址/偏移 | 原字节 | 改字节 | 效果 | 回滚 |
|-----------|--------|--------|------|------|
| `<OFFSET>` | `<ORIG>` | `<PATCH>` | 跳过 trial / 强制 valid | 恢复 `<ORIG>` |

```bash
cp SAMPLE SAMPLE.bak
# xxd -r -p 或 hexedit 按表修改；记录 runs/license-SAMPLE/patch.md
```

### 4. Keygen 骨架（算法未完全恢复时也交）

```python
# runs/license-SAMPLE/keygen_skeleton.py — 占位符直到算法确认
SERIAL = "<SERIAL>"
CHECK_FN = "<CHECK_FN>"

def generate_key(username: str) -> str:
    # TODO: 填入从 CHECK_FN 恢复的算法
    return f"PLACEHOLDER-{username}"
```

### 5. 动态验证

```bash
ltrace ./SAMPLE 2>&1 | grep -iE 'strcmp|memcmp|license' | head -20 \
  | tee runs/license-SAMPLE/ltrace-license.txt
./SAMPLE.bak  # 对比 patched vs 原版行为
```

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| 纯二进制无授权字样 | `binary-reverse` |
| APK 授权 | `apk-reverse` |
| JS 前端 sign | `js-reverse` |
| 网络激活流量 | `traffic-analysis` |

## 输出与落库

1. `redteam_chain_add` — tool=定位命令, result=CHECK_FN + patch 表路径
2. 交付四件套：**MODIFIED / DIFF / VERIFICATION / ROLLBACK**

## 纪律

1. 不编造 offset/算法；未确认标 `<OFFSET>` / `NOT RUN`
2. 在线校验：记录 URL + 占位 `LICENSE_SERVER`，给 hook/hosts 骨架
3. patch 前必须 `SAMPLE.bak`
