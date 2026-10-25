---
name: apk-reverse
description: >-
  Decompiles and analyzes Android APK/IPA with jadx/apktool and optional Frida hooks—
  exports manifest, cert pins, native libs, and hook scripts to runs/. Use when user
  mentions APK/安卓/Frida/jadx/脱壳/签名校验/SSL pinning/mobile app.
whenToUse: 拿到 .apk/.aab 或移动靶场 app，需看 Java/Smali/Native 层逻辑
role: reverse
enabled: true
---

# 移动应用逆向（APK / Native）

## 标准流程

### 1. 解包与 triage

```bash
mkdir -p runs/apk-APP
apktool d APP.apk -o runs/apk-APP/apktool -f
jadx -d runs/apk-APP/jadx APP.apk
aapt dump badging APP.apk | tee runs/apk-APP/badging.txt
unzip -l APP.apk | grep -iE 'lib/|classes' | tee runs/apk-APP/zip-list.txt
```

### 2. 关键面

```bash
grep -riE 'password|license|encrypt|sign|root|debug' runs/apk-APP/jadx/sources \
  | head -40 | tee runs/apk-APP/grep-hit.txt
cat runs/apk-APP/apktool/AndroidManifest.xml | tee runs/apk-APP/manifest.txt
```

### 3. Native（.so）

```bash
find runs/apk-APP/apktool/lib -name '*.so' | tee runs/apk-APP/so-list.txt
file runs/apk-APP/apktool/lib/arm64-v8a/*.so 2>/dev/null | head
strings runs/apk-APP/apktool/lib/arm64-v8a/libAPP.so 2>/dev/null | grep -i key | head
```

### 4. Frida hook（需设备/模拟器）

```javascript
// runs/apk-APP/hook.js — 占位 PACKAGE
Java.perform(function () {
  var Main = Java.use("com.example.MainActivity");
  Main.checkLicense.implementation = function (s) {
    console.log("license input:", s);
    return true;
  };
});
```

```bash
frida -U -f com.example.app -l runs/apk-APP/hook.js --no-pause
```

### 5. SSL Pinning / Root 检测

- 搜 `X509TrustManager` / `CertificatePinner` / `isDeviceRooted`
- 记录 bypass 点 → patch Smali 或 Frida replace

## 与其它技能的分工

| 场景 | 技能 |
|---|---|
| 纯 ELF/PE 无 APK | `binary-reverse` |
| 卡密算法在 Java 层 | `license-recovery` |
| API sign 在 WebView JS | `js-reverse` |

## 输出与落库

1. `redteam_chain_add` — tool=jadx/apktool/frida 命令, result=包名+关键类
2. hook 脚本 + manifest 摘要路径

## 纪律

1. 不反编译/传播第三方商业 app 到公网；证据留 `runs/` 本地
2. 加固/壳：标 `PACKER_DETECTED`，给 dump/脱壳下一步骨架，不猜类名
