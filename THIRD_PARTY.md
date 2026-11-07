# 第三方参考

小蚕接口协议参照以下公开项目读取并核对（2026-11-04）：

- 项目：https://github.com/lyrric/xiaochan
- 协议参考：https://github.com/lyrric/xiaochan/blob/main/src/main/java/io/github/xiaocan/http/XiaochanHttp.java

本项目的 Node.js 采集适配使用该参考的请求字段、接口方法和单位含义。未复制作者账号标识、未打包其 Java 客户端或微信凭证。本仓库用于个人协议验证，未声明开源许可证或可自由再分发。仓库可见性不代替上游许可及平台条款核对。接口可变，不提供长期可用性保证。

## 2026-11-06 新渠道参考

再次核对 lyrric/xiaochan 远端 HEAD/main 固定为 7e2db82ad6095701889255b8994b4823b5ddab05；WmmtHttp.java 为歪麦字段、动态密钥和游标契约参考。协议使用公开固定签名参数，不包含作者身份。cities.json 为该固定快照 city-code.json 提取的区县到城市参考映射，不保证行政区划现势性；手机自动保存会用该表交叉核对搜索返回的城市，矛盾或缺失时保留原位置；该校验不等于官方现势区划核验。许可和平台条款边界仍同上；本轮没有添加 npm 依赖。

已纠正固定参考中咸阳部分区县被置于省直属层的问题：610402/403/422–431（已有代码项）归咸阳市；其余已收录辖区按固定提取表查城市，不按代码前缀猜测未收录辖区。该修复不宣称整份行政映射为官方最新。Docker 基础镜像来自 nodejs/docker-node 官方发布系列，远端 HEAD 于 2026-11-06 核对为 4730c96eda1aefbf7b952fd725d6b37e9e531a8c；Docker daemon 不可用，尚未完成容器构建验收。

## Android test build (2026-11-06)

The standalone test APK uses the Android framework and a local JDK/Google Android SDK build toolchain, not an embedded Node runtime or bundled third-party JavaScript libraries. SDK tools are not redistributed. Protocol cryptography remains compatibility code for the previously documented upstream; see android/README.md for legacy-crypto limits and device-validation gaps.
Official toolchain references: https://developer.android.com/tools and https://developer.android.com/studio . The APK asset packer uses an explicit public-source allowlist. No private credentials, cached results, SDK archives, test fixtures, or signing keys are included.
