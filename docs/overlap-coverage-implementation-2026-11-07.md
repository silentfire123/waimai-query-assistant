# 有界采集与四组合重合：本轮实施记录

日期：2026-11-07（Asia/Shanghai）。基线：`cf3269adca8cf8e01dac6f92c2bfc361de52896d`。**初次本地实施时未发布；后续用户授权构建1.0.4，见 [发布说明](release-1.0.4.md)。上游距离优先尚未打通，不是全部需求完成验收。**

## 1. 范围与实现

| 已确认要求 | 本轮结果 | 证据层级／入口 |
| --- | --- | --- |
| 小蚕两类分别采集，默认20、可选10页 | 已实现；两类分别计数、游标、上限；一类早停不消耗另一类上限 | `core.mjs`、桌面与手机公开状态接口测试 |
| 美团＋分类在上游限定，距离排序后分页 | **仅保留已知字段，未验证距离优先或满返独占平台筛选**。满返`sort:1,is_show_mt:true,rebate_type:1`；比例返美团专用方法，响应再作本地美团校验。没有猜值、挪用搜索接口字段、用本地重排冒充 | 固定源码阅读；本轮没有真实小蚕分页请求 |
| 歪麦匿名最多两页，不伪装两类各两页 | 产品统一只采集一次混合名单、最多2页，有凭证也不扩页；保留`userTypes:[1,2,3]`。Node／Java另在匿名客户端限制第3页 | `collector.mjs`、`waimai.mjs`、加密参数回放、Java编译 |
| 歪麦平台单变量验证 | 完成两组各两页；采用`takeawayPlatform:meituan`，其余默认保持 | 真实匿名观察，见下表；非官方契约 |
| 无名额及未知名额都保留 | 移除三处库存0剔除；`inventoryState`区分`sold_out`、`unknown`、`reported_remaining`，负值／空／布尔／畸形值均未知，参与匹配与试算 | 核心、歪麦、HTML、共享UI、统计回归；本轮真实样本没有0库存，不能据此证明上游覆盖 |
| 不为保留库存0造金额 | 小蚕仍校验明确正返现金额／比例；固定返门槛保留null；歪麦缺会员固定金额／门槛依旧待填，不用最大阶梯补最低值 | 回归与浏览器缺失值填写 |
| 全部四种来源组合 | 小蚕满返×小蚕比例返、歪麦满返×歪麦比例返、两个跨渠道方向都参与；每条保留组合来源及独立活动 | 四组合合成回归与双端运行QA，不是真实重合商家验证 |
| 同店证据与分店边界 | 共同美团ID，或同源可靠店ID（美团活动）可确认；跨命名空间同数值不可确认；只有同名仍候选；内部ID链连向不同已知美团分店时不用这条链推断 | `storeKeys/groupStores/compare`；0／畸形／不安全数字ID不作证据 |
| 安全停止和结果留存 | 空页／上游结束、无新增、缺游标、鉴权和错误有界停止。小蚕WAF／HTTP401/403／明确登录提示跳过共享网关余下类别；被跳过类别仍显示计划、0请求和停止原因。全失败保留旧报告，本次统计单存`attempt.pagination`，不混为旧查询统计 | 桌面、手机、脱敏诊断及浏览器回归 |
| CLI兼容 | `poc.mjs`仍仅小蚕、1–10页、默认5，未机械改为双渠道20页 | 现有CLI和回归；本轮不运行真实CLI查询 |
| 登录、发布、用户进程与私密数据 | 不新增登录接入、不做自动报名／下单／后台扫描／重试；未读本人凭证或.env，未读改真实结果缓存、未重启用户服务 | 本轮操作范围；仅读取已存位置用于用户授权的匿名对照 |

`partial`表示每段结果受限／中断，并非“其他渠道一定没有活动”。计划上限不是全量承诺；上游隐藏活动无法凭空恢复。库存统计是每次响应内的活动条数，可能包含重复页中的同一活动，不应当作去重商家数；门店数另行去重。

既有`scripts/waimai-session.mjs`原来调用采集器做显式本人凭证三页验证。为避免产品两页上限破坏旧工具，改为独立有界三次只读验证循环；缺凭证不请求，重复游标停止，错误不透出原文。**本轮仅模拟回放此兼容路径，没有运行真实凭证验证，也没有把三页能力接到产品。**

## 2. 必须参考的两个项目：固定快照与完整调用链

本轮重新执行`git ls-remote`，并在系统临时目录只读克隆源码，未安装依赖、未执行参考项目脚本、未复制作者身份或地点：

- 后端main：`7e2db82ad6095701889255b8994b4823b5ddab05`。
- 其README链接前端main：`53f9ade65a1a5eadb05bbd5d9848ee49611234b4`。

| 对照点 | 固定源码证据 | 本项目处理 |
| --- | --- | --- |
| 小蚕上游筛选／排序 | [XiaochanHttp.getBody](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/http/XiaochanHttp.java#L345-L360)：`sort=1`、`is_show_mt=true`、`rebate_type`；[比例返getMeituanList](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/http/XiaochanHttp.java#L61-L81)未传距离字段 | 无已证实的距离映射，不猜。满返本地仍保留source1/2，而不是照抄只解析source1的旧缺陷 |
| Controller／DTO／Service | [XiaoChanController](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/controller/XiaoChanController.java)、[QueryListVO](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/model/vo/QueryListVO.java)、[XcMeituanshangjinDTO](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/model/dto/XcMeituanshangjinDTO.java)、[XiaoChanServiceImpl.query](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/service/impl/XiaoChanServiceImpl.java#L70-L95) | 请求链不是“前端有字段就保证上游实现”；满返页码转offset，比例返走pvId，分开维护 |
| 可抢／全部、排序 | [前端onlyAvailable默认false](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L59-L71)、[可抢／全部切换](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L1204-L1218)、[隐藏sort-chips](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L1260-L1278)；后端[sortStoreList/filter](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/service/impl/XiaoChanServiceImpl.java#L190-L230)为private，在此次query调用链未发现被调用，默认距离排序行还被注释 | 不声称参考切换实际生效；不把orderType1或sort1当成距离；无名额不做排除开关，直接保留 |
| 结果聚合与名额显示 | [前端groupedStoreList](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L258-L282)按type+uniqId聚合并累计activities；[余量显示](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L1450-L1458)使用`>0`否则售罄 | 借鉴保留逐活动，不照抄“非正数一律售罄”；本项目未知状态独立，不跨命名空间比较ID |
| 歪麦参数与分类 | [WmmtHttp](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/http/WmmtHttp.java#L188-L208)、[WmmtShopListDTO](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/model/dto/WmmtShopListDTO.java)、[WmmtController](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/controller/WmmtController.java)、[Service先混合取回再本地分类](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/service/impl/WmmtServiceImpl.java#L71-L98) | 仅以响应类型分类；不把候选userTypes值当成已知分类、不重复取同样混合列表宣称各类覆盖 |
| 歪麦与比例返前端分页 | [HomeView三条请求路径](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L308-L426)：满返pageNum，比例返pvId，歪麦scrollPageData原样透传 | 独立游标与计划统计，歪麦不按请求limit=15武断短页结束；不照搬后台最多100轮／距离截断／代理重试 |

**源码阅读已做；参考项目完整界面运行对照未做。**该参考需其应用、账号／地址状态等安全运行环境，本轮没有现成可用环境。下面的浏览器QA只验证本项目，不是参考项目效果验收；协议回放也是合成响应，不是平台真实承诺。

## 3. 真实匿名观察：只改平台的控制变量

显式空token，没有Authorization/cookie，未读.env或凭证；只读现有保存位置并用cities.json补城市（不输出）。两组从null游标分别开始，各最多2页，间隔约1.2秒；共2配置+4列表请求；遇登录／HTTP错误即停止计划，无第三页、无重试。原始响应、店名／ID、游标和动态密钥不落盘，只保留以下计数。

| takeawayPlatform | userTypes | 第1页店级type1/type2 | 第2页店级type1/type2 | 两页原始SKU平台分布 |
| --- | --- | --- | --- | --- |
| 空串（基线） | [1,2,3] | 10/10 | 10/10 | 美团47、ele8、jingdong2 |
| meituan（唯一改动） | [1,2,3] | 10/10 | 10/10 | 美团60；未见其他平台 |

每页原始门店20；两组本次观测的0库存SKU数均0，未返回库存字段的SKU数均0。按原始SKU统计平台，未经过本地normalize筛选来制造“全美团”。**结果支持本轮采用平台字段，但仍是有限时空样本，非正式契约；没有据此声称一定覆盖更多商家，也没有跨轮合并去重数冒充单次覆盖收益。**两类仍混合，不能称为满返与比例返各自两页；对库存0上游是否隐藏、`signUpFlag:2`准确含义仍无证据。

脱敏摘要：`data/diagnostics/waimai-platform-control-20261107.json`（忽略目录）。首次本地准备检查发现已存位置没有city，0网络请求；补既有cities映射后才执行上述6次网络请求。此准备失败不算接口失败或重试。

## 4. 验证矩阵与本地证据

所有路径相对实际应用根`D:/zcode-worker/waimai-assistant`；证据位于忽略目录，不进入Git。

| 场景 | 结果 | 工具直接产物 |
| --- | --- | --- |
| 全部Node回归：150项，0失败／跳过 | 通过 | `output/implementation-tests-20261107.log` |
| 新增核心／协议／UI覆盖14项 | 通过 | `output/new-coverage-tests-20261107.log`，新增的`test/overlap-coverage.test.mjs` |
| Android全部生产Java编译，既有过时API警告 | 通过（不是运行） | `output/coverage-java-compile-20261107.log`；退出0 |
| JVM协议交叉／网络策略17项 | 通过 | `output/coverage-native-test-20261107.log`；只用当场生成的虚构RSA测试密钥，测试后删除密钥文件 |
| Android公开资源白名单准备／无Node-only引用 | 通过 | `npm run android:assets`；codeVersion=`e6a55d80f659`，不是安装APK |
| 桌面默认20、四组合、同源店ID、0/未知名额与金额独立 | 通过（合成） | `output/coverage-desktop-20261107.png` |
| 桌面10页选择、全部失败旧名单与本次0请求／2页统计 | 通过（合成） | `output/coverage-desktop-blocked-20261107.png` |
| 修改位置后保留旧结果不匹配提示 | 通过（合成） | `output/coverage-desktop-history-20261107.png`、`output/coverage-desktop-ax-20261107.txt` |
| 手机375px、默认20、展开活动、缺金额／门槛填写、无横向溢出 | 通过（合成桥接，非真机） | `output/coverage-mobile-top-20261107.png`、`output/coverage-mobile-activities-20261107.png`；展开后viewport375，document/body宽360 |
| 手机失败旧结果、部分结果、刷新持久化、搜索空结果、两份名单切换 | 通过（合成桥接） | `output/coverage-mobile-blocked-20261107.png`、`output/coverage-mobile-partial-20261107.png`、`output/coverage-mobile-ax-20261107.txt` |
| 两端控制台warn/error、UI机械检查 | 无告警 | 浏览器dev.logs各为空；`output/coverage-ui-detect-20261107.json`为`[]` |
| 歪麦单变量两页 | 有限样本支持平台限定 | 上节脱敏摘要，不是四组合／距离／上游无名额覆盖证明 |
| 真实距离优先、独占平台契约、上游隐藏库存0、真实长分页／四组合 | **未验证／未打通** | 缺可靠契约或授权安全环境，本轮不枚举参数 |
| iQOO15安装、原生桥接／网络／位置／登录 | **未验证** | 无本轮真机／模拟器证据 |

本轮QA自建两个临时端口服务（合成数据，无真实上游）已停止，浏览器测试页已关闭并重置viewport。证据保留；系统临时目录`C:/Users/silentfire/AppData/Local/Temp/waimai-overlap-ui-3UUBdJ`仅有合成位置／状态，递归清理被执行策略拒绝，未改用其他方式强删。如需清理可由用户运行PowerShell：`Remove-Item -LiteralPath 'C:\Users\silentfire\AppData\Local\Temp\waimai-overlap-ui-3UUBdJ' -Recurse -Force`。临时只读参考源码与Java类也留在本机Temp，不是用户业务结果。

## 5. 初次实施阶段的交付边界（后续发布另记）

初次实施结束时：无新增依赖、无自动提交／推送／Release、未改版本号、未产生新可安装APK、未覆盖旧版附件。旧1.0.3包不含本轮修改。后续收到明确发布授权，已按规则递增为1.0.4 / versionCode=7，完成完整构建与同证书签名／最终APK门禁；仍保留真机剩余验收项。

结论：**本地实现与合成QA通过，但上游能力与真机存在缺口。**特别是用户最初要求的“距离排序后分页”，本轮没有可靠证据可安全落地，已经在界面、产品与接续说明中明示，不以其他排序冒充完成。

## 6. 变更文件

- 核心采集／归一化／同店匹配：`core.mjs`、`collector.mjs`、`waimai.mjs`、`waimai-client.node.mjs`。
- 双端状态与诊断：`server.mjs`、`android/mobile/api-engine.mjs`、`diagnostic-core.mjs`。
- Android请求适配：`android/app/src/main/java/local/waimai/assistant/WaimaiClient.java`。
- 共享界面：`web/app.js`、`web/index.html`；未改CSS或重设计。
- 既有显式凭证工具兼容与结构校验：`scripts/waimai-session.mjs`；仅模拟验证。
- 新增测试：`test/overlap-coverage.test.mjs`；更新`test/app.test.mjs`、`test/features.test.mjs`、`test/feed-source.test.mjs`、`test/location-ui.test.mjs`、`test/mobile.test.mjs`、`test/ui-calculator.test.mjs`、`test/waimai-session.test.mjs`。
- 文档：本文件、`README.md`、`PRODUCT.md`、`QA.md`、`HANDOFF.md`、`THIRD_PARTY.md`、`android/README.md`。
- 本轮开始前已有的两份匿名研究文档保持不变；初次实施未修改依赖清单、版本清单、旧APK或真实结果；发布准备另修改package.json与AndroidManifest.xml版本，不覆盖旧APK。
