# 安卓内置更新

带更新器的 APK 在启动时检查 GitHub 的最新稳定 Release。只有发现更高的三段式版本号，且 Release 同时包含可验证的 APK 和校验值时，才弹出更新对话框。

## Release 约定

每次发布都必须保持以下约定：

- Release 标签使用三段式版本号，例如 `1.0.7`；GitHub 的 `latest` 接口不会选择草稿或预发布版本。
- APK 资产命名为 `waimai-assistant-<versionName>.apk`，例如 `waimai-assistant-1.0.7.apk`。
- 同一个 Release 上传 `SHA256SUMS.txt`，其中包含 APK 文件名和 SHA-256 摘要。
- 同一个 Release 上传名为 `update.json` 的资产，内容至少包含 `versionName`、`versionCode`、`apkName`、`sha256` 和 `notes`。
- `update.json` 的 `notes` 写本次升级说明；内容会直接显示在 App 弹窗中，建议先写用户能看到的变化和已知限制。
- `versionCode` 必须单调递增，包名必须保持 `local.waimai.assistant`，签名必须继续使用同一把签名密钥。

更新器读取 GitHub Release 的稳定资产 `update.json`，不依赖 GitHub REST API，因此不会因为未认证 API 限流而失效。`update.json` 中必须包含 `versionName`、`versionCode`、`apkName`、`sha256` 和 `notes`；摘要缺失或格式不正确时不会显示更新，也不会安装未经校验的 APK。

示例：

```json
{
  "versionName": "1.0.7",
  "versionCode": 10,
  "apkName": "waimai-assistant-1.0.7.apk",
  "sha256": "<APK_SHA256>",
  "title": "1.0.7 自用测试版",
  "notes": "- 增加启动时更新检查\n- 增加 APK 校验和系统安装流程"
}
```

## 用户流程

1. App 启动后在后台检查最新 Release，网络失败不会阻断正常查询。
2. 发现新版本时显示版本号和 `update.json` 的 `notes`，并提供「立即更新」与「暂不更新」两个按钮。
3. 选择「立即更新」后下载 APK，先校验 SHA-256，再交给 Android 系统安装器。
4. Android 可能要求用户允许该应用安装未知来源应用；返回 App 后会继续打开安装器。
5. 安装仍由系统确认，不能静默安装。用户选择「暂不更新」后，本次启动不再弹出，下一次启动会再次检查。

## 首次启用

已发布的 1.0.6 APK 没有更新器，不能自动把更新器注入已安装程序。当前源码已递增到 1.0.7 / versionCode=10；需要先手动覆盖安装这个首个包含更新器的版本，之后才能从 App 内更新到后续 Release。
