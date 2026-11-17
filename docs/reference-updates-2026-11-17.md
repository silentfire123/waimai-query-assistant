# GitHub 参考项目更新与可复用项（2026-11-17）

## 结论

对照外卖助手当前代码，最有价值的请求头格式调整已进入 1.0.5；下一步建议优先改善同店多活动的展示、查询结束的数量反馈和同名待确认的操作。保留当前已实测可用的满返 feed + 比例返专用接口组合。统一 feed、推送服务和身份随机化不能按上游提交直接搬入。

本轮为源码研究和现有证据复核，没有运行上游服务、安装依赖、执行真实活动查询或修改产品代码。建议是评估结果，尚未实施。

## 固定版本与时效

2026-11-17 通过 `git ls-remote` 和 GitHub API 交叉核对；日期以访问日记录，提交时间按 GitHub UTC 字段。

| 项目 | 之前固定参考 | 本次固定 HEAD/main | 差异 |
| --- | --- | --- | --- |
| lyrric/xiaochan 后端 | 7e2db82ad6095701889255b8994b4823b5ddab05 | a90b9adbd46835aa65cf4a3369f8beddd5bff23b | 17 个提交，2026-11-04 至 11-16；最新 2026-11-16T06:45:22Z |
| lyrric/xiaocan-front 前端 | 53f9ade65a1a5eadb05bbd5d9848ee49611234b4 | f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1 | 11 个提交（含 2 个合并），7 个文件；最新 2026-11-16T06:47:24Z |
| 本项目 | — | f1f384a（研究开始时） | 1.0.5 发布记录，工作区开始时干净 |

比较范围按旧固定提交计算，不能称为“11 月 7 日之后恰好 17 个提交”，因为其中首个提交的日期是 11 月 4 日。较早保存在 `research/xiaochan` 的副本不代表最新代码。

后端依据：[固定提交](https://github.com/lyrric/xiaochan/commit/a90b9adbd46835aa65cf4a3369f8beddd5bff23b)、[固定区间比较](https://github.com/lyrric/xiaochan/compare/7e2db82ad6095701889255b8994b4823b5ddab05...a90b9adbd46835aa65cf4a3369f8beddd5bff23b)。前端固定版本与逐项核对见 [独立前端研究](reference-frontend-updates-2026-11-17.md)。

注意：网页工具读取浮动 `raw.githubusercontent.com/.../main/CHANGELOG.md` 时曾返回只更新到 11 月 3 日的缓存；本报告以 GitHub API 固定 SHA 内容和提交差异为准，未把搜索索引日期视为远端最新状态。

## 后端这轮实际改动

| 时间与提交 | 实际变化 | 我们的处理建议 |
| --- | --- | --- |
| 11-04 cb09008 | 移除正常请求的响应体 info 日志 | 原则可借鉴；当前共享界面已有脱敏诊断。上游 `checkResult` 失败分支仍打印整个 body，不能据此称全部响应日志已脱敏。 |
| 11-10 00dd717 / 1a3208e / 92ac9b7 | silk 标识随机、固定 user 标识调整、每次随机 UA | 不照搬。当前采用匿名或本人配置，已有旧 UA 的成功证据，没有必要把多个变量一起改动。 |
| 11-12 至 11-13 da4d8bd / 959ffe1 / 9d783c6 / f16a6c7 | 手动查询满返与比例返的同名门店并立即推送；独立推送类型；批消息按 uniqId 去重计数 | 可借鉴查询交集与活动编排；本项目已有更严格同店证据及四种来源组合，当前产品范围也没有后台扫描、推送。 |
| 11-13 b72af08 / d7fd8ee / 40bb1c3 | 封装 XiaochanListDTO；平台筛选；满返与比例返共用 feed；统一页码、每页数和游标 | 我们满返已使用美团筛选和有界分页。比例返统一 feed 在此前匿名实测仅返回 status，继续保留已验证的专用接口。DTO 形状不是服务端已执行筛选的证明。 |
| 11-13 2075e75 | 最小实付监控筛选增加库存非 null 判断 | 我们已区分 0 与未知并保留两者；不采用其只保留有库存活动的筛选规则。 |
| 11-16 3eb3bd3 | 调整 Referer 为动态后缀格式，同时修改固定 user 标识 | Referer 格式已被我们单变量实测并进入 1.0.5，身份改动未采用。 |
| 11-16 a90b9ad | 同名门店请求返回满返获取数、比例返获取数及成功推送数 | 可借鉴结束时的数量反馈，但要重新核对计数口径，不能把字段名直接当作去重店数。 |

歪麦 `WmmtHttp.java` 在该范围内唯一变更是把注释“美团赏金”改成“比例返”；没有新的 URL、请求字段、签名或加解密实现差异。见固定区间比较。

## 前端这轮实际改动

固定 HEAD `f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1`，相对旧参考增加 11 个可达提交（含 2 个合并），7 个文件。独立研究代理已落盘，主代理已阅读全文。

- 首页默认入口与尚未搜索状态调整；新增请求版本校验，条件重置后旧请求不能覆盖新列表。
- 比例返请求增加城市、页码、页容量和游标对接，匹配后端统一参数变更。
- 监控页增加手动推送同名门店；推送历史把同名门店的两类活动放入同一卡片，新增独立通知类型。
- 活动行类型文案与数量反馈改善；比例返隐藏时间范围。该展示选择不能证明比例返没有时间条件。
- 最终版本部分 Tab 切换和滚动会自动调用上游，不能只看较早“手动搜索”的提交名。我们当前切 Tab 只筛本地结果，继续保留。

取舍：可借鉴卡片层次与请求版本校验的思路；当前有 busy 和位置锁，未发现必须立即补请求版本的证据。新通知和自动加载会改变产品范围，暂不推荐。来源、固定行号与细节见 [独立前端研究](reference-frontend-updates-2026-11-17.md)。

## 关键实现证据与反证

1. [XiaochanHttp.java 281–304](https://github.com/lyrric/xiaochan/blob/a90b9adbd46835aa65cf4a3369f8beddd5bff23b/src/main/java/io/github/xiaocan/http/XiaochanHttp.java#L281-L304)：`offset=(pageNum-1)*pageSize`，`rebate_type`，`store_platforms`；`sort` 仍是 1，没有解释其距离语义。不能把这轮更新宣称为距离优先已打通。
2. [XiaochanHttp.java 308–344](https://github.com/lyrric/xiaochan/blob/a90b9adbd46835aa65cf4a3369f8beddd5bff23b/src/main/java/io/github/xiaocan/http/XiaochanHttp.java#L308-L344)：随机 UA、Referer 及逐请求会话 ID。当前助手保留稳定查询会话，不能用参考代码替换后破坏分页。
3. [XiaochanHttp.java 370–397](https://github.com/lyrric/xiaochan/blob/a90b9adbd46835aa65cf4a3369f8beddd5bff23b/src/main/java/io/github/xiaocan/http/XiaochanHttp.java#L370-L397)：`feed_items` 缺失即返回空集合；只解析 source 1 和 5。我们继续拒绝把只有 status 的响应当作空名单，保留满返 source 2。
4. [XiaoChanServiceImpl.java 63–124](https://github.com/lyrric/xiaochan/blob/a90b9adbd46835aa65cf4a3369f8beddd5bff23b/src/main/java/io/github/xiaocan/service/impl/XiaoChanServiceImpl.java#L63-L124)：同名匹配是名字集合相交，不是 ID 证明；返回的两个获取数量来自列表 `size()`，列表元素可能是一店多活动；`pushedStoreCount` 来自名字集合大小。上游文案“门店”与实现的去重维度并不完全一致。
5. [XiaoChanServiceImpl.java 308–333](https://github.com/lyrric/xiaochan/blob/a90b9adbd46835aa65cf4a3369f8beddd5bff23b/src/main/java/io/github/xiaocan/service/impl/XiaoChanServiceImpl.java#L308-L333)：比例返强制 `rebate_type:2` 和美团筛选，末项取游标；继续分页含距离比例启发式。我们的请求上限、重复页、无新增、缺游标和 WAF 停止规则保留。
6. [MessageService.java](https://github.com/lyrric/xiaochan/blob/a90b9adbd46835aa65cf4a3369f8beddd5bff23b/src/main/java/io/github/xiaocan/service/MessageService.java)：批消息独立按 `uniqId` 集合计数，与上条同名查询返回值并非一个统一口径。
7. [11-13 更新记录提交](https://github.com/lyrric/xiaochan/commit/62c7fca76ba95ce1d58d2f901d370208eedda8e5)：前后端的功能主线；不能替代上述实现核对。

## 对照我们当前已具备的能力

| 能力 | 本项目证据 | 评估 |
| --- | --- | --- |
| 同 ID 确认和同名候选分离；已知不同分店不合并 | `core.mjs` 的 `compare`、`storeKeys`；`web/app.js` 的 badge | 保留现行口径，不能降级成名字相同即确认同店。 |
| 两来源满返 × 两来源比例返四组合 | `core.mjs` 的 combinations；`PRODUCT.md` | 已具备，无需因上游新增小蚕同名交集再做一次采集。 |
| 一店多活动和计算器 | `groupStores` 的 activities；`web/app.js` 的 row / calculatorMarkup | 已具备数据结构，展示可继续收拢。 |
| 门店去重计数、分页请求数和停止原因 | `core.mjs` 的 counts / pagination；`web/app.js` 的 render | 已有基础；可把折叠范围中的核心数移到查询结束摘要，但分清“家 / 条 / 对”。 |
| 0 库存与未知库存 | `core.mjs`、`waimai.mjs`；`inventoryText` | 已具备，不能照搬“库存 >0 才保留”的规则。 |
| Referer 修复及专用比例返保留 | `docs/waf-recovery-2026-11-17.md`、`core.mjs` headers / queryLive | 已进入 1.0.5，当前轮不再重复修改。 |

当前代码和 APK 的判断以 `README.md`、`PRODUCT.md`、`THIRD_PARTY.md` 和 `docs/waf-recovery-2026-11-17.md` 为依据。另一个排查聊天中用户补充确认：安装 1.0.5 后关闭 VPN，两渠道均成功；这是用户反馈，没有把它扩展为完整定位、覆盖或到账验收，本轮也未据此改写旧排查文档。

## 建议的下一步范围

以下是建议，尚未获实施任务、未改业务代码：

1. **优先：同店活动展示。** 让一店多个满返／固定返和比例返分区呈现，保留来源、条件、库存及计算器入口；在多活动较多时折叠，减少手机滚动。复用已采集数据，无需再查接口。
2. **优先：查询结束摘要。** 就近展示各渠道取得的去重店数、确认重合、待确认候选对数及未完成渠道，保留已有失败历史名单提示；不把活动条数充当店数。
3. **其次：候选门店核对入口。** 借鉴参考前端的门店搜索体验，但一期先展示已有可靠 ID、来源与分店信息。若再做上游定向搜索，需要分别证明名称参数真实生效和返回的是目标店；不能只看到 DTO.name 就认定搜索正常。
4. **暂缓：推送和平台扩展。** 上游 SPT、监控配置、数据库历史与当前“手机独立、按需查询”的目标不同。京东或饿了么筛选值也不代表本项目金额模型、同店匹配和活动规则已经兼容。

不把“距离优先、歪麦更多匿名页、本人会员到账、自动判断可叠加”列为本轮已找到可直接复用的成果；本次源码没有提供足够新证据解决这些问题。

## 许可与运行边界

本轮固定后端根目录树未见 LICENSE 文件；前端核对见独立报告。这里只记录可见性，未作法律判断或声明获得复制授权。建议是参考行为和协议证据、在自身实现中验证；没有将上游 Java/Vue 代码打包进产品。
