# 接续开发入口

更新：2026-11-07（Asia/Shanghai）。先读当前 [README.md](README.md)、[PRODUCT.md](PRODUCT.md) 和 [QA.md](QA.md)，不要把归档中的旧页数、已停止的进程或曾经的排除规则当成当前状态。

## 实现入口

- 小蚕采集、固定返口径和同店匹配：`core.mjs`；多渠道聚合：`collector.mjs`；歪麦解析／分页：`waimai.mjs`。
- `platform.mjs` / `waimai-client.node.mjs` 是 Node 适配；`android/mobile/platform.android.mjs` / 原生 Java 是 Android 适配，不是重复可删文件。
- 桌面状态／位置／查询／诊断：`server.mjs`；手机本地状态机：`android/mobile/api-engine.mjs`；界面：`web/`。
- 手机一次位置：原生 `MainActivity` 的系统定位和 Geocoder → `/api/location-current` → 既有地址搜索补齐区划 → 原子保存。查询坐标用真实 GPS 转 GCJ-02，不使用搜索候选坐标冒充当前位置。
- 桌面 `/api/location-reverse` 仍使用本人 `AMAP_KEY`。手机旧地图 Key 路径已移除，不应为手机重新增加 Key 设置。
- 构建资源使用 `scripts/prepare-android.mjs` 白名单，最终签名包由 `scripts/verify-android-apk.ps1` 检查；新增／移除运行资源要同步两处。

## 当前维护规则

- 网页／手机 10/20 页（默认 10），兼容 CLI 1–10 页（默认 5）。别机械统一为同一范围。
- “实付满返”含固定返；门槛未知不代表无门槛，详见 [GLOSSARY.md](GLOSSARY.md)。
- 同 ID 与同名候选不可混淆；保留来源命名空间、分店边界、分页停止原因以及失败保留旧结果。
- 不读取／改写真实缓存来制造验证数据，不终止用户既有服务，不提交凭证、地址、响应或签名私钥。
- 标签／APK 显示版本按 `1.0.1`、`1.0.2`…递增，versionCode 单调递增。同签名覆盖更新，不重写旧标签或替换旧版附件冒充新版本。

## 后续验证优先级

1. iQOO 15 实际安装、授权、GPS、系统 Geocoder 和真实网络查询；失败时记录脱敏提示，不把合成桥接称为真机。
2. 本人合法凭证下歪麦后续页和会员金额口径；匿名第三页曾要求登录，不能保证更大覆盖。
3. 若再做云端：先确认部署账户、费用、状态持久化及上游出口，不重复沿用已被手机独立运行替代的旧云端计划。

过去商家漏采、source=2、固定返和阶段验收只在需要追溯时读 [docs/history/README.md](docs/history/README.md)。


## 本轮接续：1.0.3（2026-11-07）

- 承接聊天《修新bug》最后已确认需求：定位与搜索互斥；黄色／绿色提示各自默认收起，同次查询保留展开，新查询重置；严重错误不隐藏。测试设备按用户后续更正为 iQOO 15。
- 已修共享界面的操作锁、冷却与候选保存状态；移除手机入口与共享界面竞争的重复监听器；使用原生 details／summary。不改地图服务、凭证、采集或同店匹配算法。
- 补充真实界面处理逻辑 + 手机公开状态接口的合成回归，包括定位等待、搜索失败、授权拒绝、空结果、保存失败和提示状态；新查询失败仍展示旧结果时也重置绿色折叠状态。
- 1.0.3 / versionCode=6 已于 2026-11-07（Asia/Shanghai）推送并发布 GitHub 自用测试版 Release，沿用原测试证书；附件为 waimai-assistant-1.0.3.apk 与 SHA256SUMS.txt。标签指向修复提交 7c1722a，旧版附件保留。
- 验收未完成项：iQOO 15 原生定位／地址服务、真实上游、覆盖安装数据保留。浏览器验证使用合成桥接，真实位置、凭证、响应及私钥不进入测试或提交。

- 最终验证：132/132 测试、9 组浏览器合成场景、独立复核两项问题修复确认、APK v2/v3 与旧版同证书；codeVersion=42c6b87f0c3c。本地安装包 output/android/1.0.3/waimai-assistant-1.0.3.apk。
