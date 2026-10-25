---
name: binary-reverse
description: >-
  Static and dynamic reverse of PE/ELF/Mach-O binaries via file/strings/r2/ghidra
  triage—exports patch tables and key function notes to runs/. Use when user mentions
  逆向/脱壳/Ghidra/r2/IDA/ELF/exe/dll/so/算法分析/反调试.
whenToUse: 拿到本地样本文件（非纯 Web），需要定位校验函数、算法或 patch 点
role: reverse
enabled: true
---

# 二进制逆向（静态 triage → 动态验证）

> 本地 lab 样本 / CTF crackme / 授权 RE。大文件（>10MB）优先切片，不用 Read 硬读全文。

## 标准流程

### 1. Triage

```bash
mkdir -p runs/re-SAMPLE
file SAMPLE | tee runs/re-SAMPLE/file.txt
sha256sum SAMPLE | tee runs/re-SAMPLE/sha256.txt
strings -n 6 SAMPLE | grep -iE 'password|license|flag|debug|error' | head -50 \
  | tee runs/re-SAMPLE/strings-hit.txt
readelf -h SAMPLE 2>/dev/null || echo "not ELF" | tee -a runs/re-SAMPLE/file.txt
```

### 2. radare2 快扫

```bash
r2 -q -c 'aaa; afl; iz' SAMPLE | head -80 | tee runs/re-SAMPLE/r2-afl.txt
r2 -q -c 'aaa; pdf @ main' SAMPLE | tee runs/re-SAMPLE/r2-main.txt
```

### 3. Ghidra / IDA（深度）

- 导入 SAMPLE → 找 `main` / 导出 / 字符串 xref
- 记录：**函数名/地址/伪代码摘要** → `runs/re-SAMPLE/notes.md`

### 4. 动态（Linux ELF）

```bash
ltrace ./SAMPLE 2>&1 | head -30 | tee runs/re-SAMPLE/ltrace.txt
strace -f ./SAMPLE 2>&1 | head -50 | tee runs/re-SAMPLE/strace.txt
gdb -batch -ex 'break main' -ex run -ex disassemble SAMPLE
```

### 5. Patch 表（可逆）

| 地址/偏移 | 原字节 | 改字节 | 效果 | 回滚 |
|-----------|--------|--------|------|------|
| 0x401234 | 74 05 | 90 90 | NOP 跳转 | 恢复 74 05 |

```bash
cp SAMPLE SAMPLE.bak
# xxd/hexedit 按表修改
```

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| 卡密/激活链 | `license-recovery` |
| APK | `apk-reverse` |
| JS 加密 | `js-reverse` |
| 流量里密钥 | `traffic-analysis` |

## 输出与落库

1. `redteam_chain_add` — tool=执行的 r2/gdb 命令, result=关键函数+结论
2. patch 表 + `SAMPLE.bak` 路径写入 notes

## 纪律

1. 不编造 offset；未分析标 `<OFFSET>`
2. 反调试：记录检测点 → 占位 `ANTI_DEBUG_SNIPPET`，给 bypass 步骤骨架
3. Windows 样本在 Linux 用 `file` + strings；深度用 Ghidra 跨平台
