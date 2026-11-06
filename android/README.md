# 安卓独立版（自用测试版）

目标：手机直接向既有渠道查询；不需要电脑常驻或部署云服务器。**独立运行不是离线查询**，真实活动与地址搜索仍需联网。

## 安装与首次使用

生成位置：`android/build/waimai-assistant-standalone-test.apk`（不提交 Git）。

1. 将 APK 传到本人安卓手机，在文件管理器中打开；按系统提示仅为这次安装允许可信来源。不要关闭系统安全扫描。
2. 要求 Android 8.0 / API 26 或更新版本，以及 Android System WebView / Chrome 105 或更新版本。APK 没有 CPU 架构限制，无原生 `.so`。
3. 先点「查看演示」，检查显示与试算；演示数据完全虚构，不查询真实接口。
4. 「设置位置」→搜索地址→选择并核对→保存→手动点击查询。搜索需要上游可用；也可手填 GCJ-02 坐标、行政区划代码及城市。
5. 需要本人凭证时，打开右上角「手机设置」。不提供微信账号登录/自动提取凭证，不打包电脑 `.env` 或缓存。匿名可尝试查询，但不保证能翻完整名单。
6. GPS 是按按钮一次获取、需要系统授权；反查完整地址还需本人高德 Web 服务 Key。没有 Key 时请搜索选点或手填，不误称 GPS 不需配置即可完成。
7. 查询时保持应用前台，尽量不锁屏。**没有后台常驻服务**；返回桌面、关闭或被系统回收可能中断。重启会提示上次中断，保留此前已完成的结果，不自动续查。
8. 诊断使用系统「另存为」保存 JSON；取消不会声称导出成功。诊断不包含地址、坐标、名单、凭证或原始响应。

卸载 / 清除应用数据会删除位置、名单及凭证。自用测试签名不是应用商店发行签名；后续覆盖更新须沿用相同签名文件及包名 `local.waimai.assistant`。

## 实现

- `core.mjs`：原有采集、匹配、报告核心，Node 和 Android 共享；`poc.mjs` 保留 CLI 入口及既有导出。
- `platform.mjs` / `waimai-client.node.mjs`：桌面 Node 适配器；不进入 APK。
- `android/mobile/platform.android.mjs`：安卓桥接适配器；仅同步 MD5/UUID、配置摘要和原子存储，联网异步执行。
- `android/mobile/api-engine.mjs`：相同前端调用约定的手机本地状态机，无 HTTP 服务、无 localhost 端口、无云端地址。
- `MainActivity.java`：只允许 APK 自有虚拟 HTTPS 页面访问桥接，拦截外部导航；关闭文件访问、Cookie、第三方页面及明文 HTTP。
- `NetworkPolicy.java`：限制到已有只读 HTTPS 路径、RPC 方法；禁重定向，有连接/读取时限及体积上限，不允许任意代理。
- `PhoneStore.java`：位置/结果使用应用私有目录原子文件；本人凭证使用 Android Keystore AES-GCM 加密；禁备份及设备迁移。凭证不能抵御已 root / 被攻陷的手机。
- `ProtocolCrypto.java`：仅为兼容现有上游协议使用旧式 MD5/AES-ECB/RSA-PKCS1；不用于新设计的本地凭证加密。

## 构建

构建不依赖 Gradle、第三方 npm 包或云构建。使用现有 JDK 21 和 Google 官方 SDK 的 Android 36 platform、Build Tools 36.1.0。SDK 工具从 Google 官方 repository 元数据定位并核对归档 SHA-1 后解压；SDK/密钥不进入仓库或 APK。使用 SDK 前应遵守 Google SDK 许可；构建脚本不自动接受许可。

在仓库目录执行 PowerShell（将工具路径改为本人环境）：

```powershell
.\scripts\build-android.ps1 `
  -JavaHome 'D:\JetBrains\PyCharm 2025.3.3\jbr' `
  -PlatformJar 'D:\DevCache\android\platforms-android-36\android-36\android.jar' `
  -BuildTools 'D:\DevCache\android\build-tools-36.1.0\android-16' `
  -SigningKey 'D:\DevCache\android\waimai-local-test.jks'
```

脚本只删除本仓库 `android/build/` 生成目录；打包文件采用显式白名单，不包含 `data/`、`output/`、`.env`、真实位置、本人凭证、旧项目配置或 QA 桥接替身。自用测试密钥默认使用公开的 Android 测试密码，**不适合发行**；正式分发前必须换为安全保存的发行签名并完成验收。

```powershell
npm test
npm run android:assets
```

## 2026-11-06 验证状态与边界

- 99 项 Node 测试通过：包含原有回归、手机本地状态机、文件恢复、查询锁、冷却、错误保留旧结果、诊断脱敏、定位与搜索调用约定。
- JVM 加密交叉测试通过：MD5、AES 与 Node 字节一致、RSA 双向封装/解封装；只使用生成的虚构密钥。
- JVM 网络策略测试通过：只读白名单放行，伪造域名、HTTP、用户信息、端口、路径穿越、fragment、未知方法拒绝。
- APK 构建、对齐及 v2/v3 签名校验通过；这些只证明构建产物有效，**不证明 Android 实际运行可用**。
- 浏览器只验证 APK 内网页内容与 JS 手机状态机；Android 桥接是合成替身。确认演示/试算、搜索、定位拒绝、保存位置、手动查询、冷却、刷新恢复及导出提示；375px 检查无横向溢出，未见浏览器控制台错误。这不是手机截图，也不是原生存储、Keystore 或系统文件选择器的验收。
- **未连接真机，也没有运行安卓模拟器。** 安装、首次启动、原生 JavaScript 桥接、Android 网络和上游出口、真实凭证、GPS/权限、Keystore、旋转/大字体/后台回收以及系统另存为仍待真机验收。不要把现有桌面实测当作手机端实测。
- 原有第三方协议没有官方稳定契约；登录要求、字段缺失或风控仍可能阻止查询，APK 不承诺绕过登录/风控、不承诺返现叠加或实际到账。

本地证据（忽略目录，不提交）：`data/android-regression-tests.txt`、`data/android-build.txt`、`data/android-native-test/results.txt`、`data/android-qa/`。
