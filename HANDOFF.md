# 接续开发入口

当前范围以 PRODUCT.md 为准；本轮用户已移除歪麦渠道。先读 README.md、PRODUCT.md 和 QA.md，需要旧多渠道决策时再看 docs/history/。

## 当前实现

- 小蚕采集、活动时段、匹配与报告：`core.mjs`；采集入口 `collector.mjs` 只调用小蚕。
- Node 平台：`platform.mjs`；Android 平台：`android/mobile/platform.android.mjs`。两平台是实际运行适配，保持同步。
- 桌面状态与落盘：`server.mjs`；手机本地状态机：`android/mobile/api-engine.mjs`；界面：`web/`。
- `projectXiaochanReport/projectXiaochanSnapshot` 在读取状态时投影旧混合报告，只保留小蚕活动并重新匹配；持久化前保持原报告，不因升级抹掉旧数据。新成功报告标记 `channel:'xiaochan'`，失败保留旧报告。
- 活动时段只读活动级 `start_time_hour/end_time_hour`，规范化到 `activityTime`；合法时刻及跨午夜可展示，缺失／畸形／相同时刻保留未知。比例返不继承门店层时间，营业时间不替代活动时间。
- 原生 `wmInit/wmPage`、歪麦 Token 输入及公开摘要、歪麦网络白名单与客户端已移除。旧包名、Keystore alias、凭证文件名保持，保存小蚕设置时复制旧凭证容器；明确选择删除全部凭证才清空。
- `scripts/prepare-android.mjs` 白名单与 `scripts/verify-android-apk.ps1` 同步维护；前者清掉白名单外旧构建资源，后者拒绝退役渠道模块混入 APK。

## 必须保留的产品口径

- 网页／手机两类各自 10/20 页，默认20；CLI 1–10 页、默认5。它们有不同调用范围。
- 满返含固定返；未知门槛不等于零门槛。同名候选对数与确认门店家数分开，库存与资格也分开。
- 保留满返 source 1/2、同轮稳定会话、Referer 修复、WAF／鉴权首次停止；比例返使用专用接口，不凭源码再次迁移到统一 feed。
- 只在隔离的临时位置／存储上构造 QA 数据；不改真实缓存、不终止用户服务、不提交凭证、位置、原始响应或签名私钥。
- 新安装包递增 versionName 与 versionCode，沿用同签名覆盖；旧 Release、标签和附件保留。

## 当前交付与后续

1.0.6 / versionCode=9 已提交、推送并发布自用测试版 Release；标签固定到 `96912eea13d8ea82c715dc1c6ef82eccd3ecb02c`，远端附件下载摘要与本地一致，Windows／Ubuntu CI 通过。验证及产物见 docs/release-1.0.6.md，公开参考及本次时间字段观察见 THIRD_PARTY.md。

后续优先真机覆盖安装与数据保留、原生定位／地址服务、本人正常网络下查询；时段不代表报名或叠加资格。云端或提醒需求需单独确认运行方式与成本。
