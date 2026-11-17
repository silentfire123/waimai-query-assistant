# 参考前端更新核对：2026-11-17

## 范围与版本

- 参考仓库：`lyrric/xiaocan-front`。本次以 GitHub API 和 `git ls-remote` 重新读取公开源码，不运行前端、不安装依赖、不发送推送。
- 11 月 7 日参考基线：`53f9ade65a1a5eadb05bbd5d9848ee49611234b4`。
- 本次远端 HEAD/main：`f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1`，提交时间 `2026-11-16T06:47:24Z`（洛杉矶 2026-11-15 22:47:24；北京时间 2026-11-16 14:47:24）。
- 相对基线增加 11 个可达提交（含 2 个合并提交），改变 7 个文件。[S1]
- 本地对照：外卖助手当前 README.md、PRODUCT.md、web/app.js、core.mjs、server.mjs、android/mobile/api-engine.mjs。没有修改业务代码。
- 本文的“观察”仅指源码及 Git 数据；没有验证该参考站点实际可用性，也未将其内部 API 当作平台官方契约。

## 上游具体更新

| 日期（提交 UTC 日期） | 提交 | 源码观察 |
| --- | --- | --- |
| 11 月 9–10 日 | `98b3151`、`2f0db13`、`8b10f33` | 默认入口从监控页改到首页、小蚕满减；进入首页等待手动搜索，增加尚未搜索提示；修改地址、排序、关键词等会重置待搜索状态。 |
| 11 月 12 日 | `732c498` | 在监控配置页增加“推送同名门店”；推送历史把满减和比例返活动合并到卡片。 |
| 11 月 12 日 | `8e6d0c9` | 美团比例返列表增加 cityCode、pageNum、pageSize；请求时传页数并保存返回的 pagePvId。 |
| 11 月 13 日 | `6cb8994`、`0906ff0`、`520f146` | 修正活动排版、推送数量提示；比例返行不再显示时间范围；增加独立 SAME_NAME_STORE_ACTIVITY 类型以及历史类型兼容。 |
| 11 月 16 日 | `e27e39b`，合并 `f01ea60` | 同名推送反馈明确显示两侧获取门店数量和推送门店数量；非小蚕满减 Tab 切入时会发起查询，并保留滚动加载。 |

以上提交范围来自 [S1]。最终行为以固定版本代码为准，尤其不能把早期“手动搜索”提交名理解为最终所有 Tab 都完全手动。

### 1. 首页与请求状态

当前默认路由为 `/home`，首页默认 Tab 为 `xiaochan`。[S2][S3]

`hasSearched` 区分“还没查”和“查过但为空”；`resetSearchResults` 清空列表、页码与游标，并递增 `listRequestVersion`。每个列表请求在成功、错误、finally 中校验版本，旧请求不再覆盖当前搜索状态。[S3：25–26、316–360、628–646]

注意最终代码：`handleTabChange` 对 `meituan`、`waimai`、`favorite` 会调用搜索，小蚕满减仍等待点击；`loadNextPage` 由 IntersectionObserver 驱动并受 `hasSearched`、loading、error、hasNextPage 防护。这不是后台持续扫描，但切 Tab 和滚动确实可能触发上游请求。[S3：649–704、707–729、1199–1211、1395–1399]

### 2. 比例返分页

前端自有 `/api/xiaochan/mtsj` 请求加入 `cityCode`、`pageNum`、`pageSize`。reset 时清 pvId/pageNum，成功后提交页码和 `pagePvId`，下一页由是否有游标且本页非空判断。[S3：83–93、364–415]

这只证明前端如何调用自己的后端，不证明平台比例返统一 feed 对匿名请求有效；助手已经有专用比例返分页及独立停止策略，不能单凭该改动换接口。

### 3. 手动同名门店推送

仅在 `MINIMUM_PAY` 且 `XC_MANJIAN` 配置上显示“推送同名门店”按钮。请求 `/api/notify/config/push-same-name`，带 configId、5 分钟客户端超时；Set 防止同配置重复触发。成功提示区分满减门店数、比例返门店数、实际推送门店数。[S4：269–305、685–696]

其推送历史按 `[locationId, type, name]` 分组，使两类活动显示在同一卡片；识别新 SAME_NAME_STORE_ACTIVITY 类型，并兼容旧 MINIMUM_PAY + XC_MTSJ 批次。[S5：25–55]

这是基于位置、平台、名称的展示聚合，源码没有因此提供可靠同店 ID 证据。不能直接拿来替换助手当前“同 ID 确认 / 同名待确认”的规则。[S5；L1]

### 4. 活动展示

同名推送卡片把来源类型放到每一条活动；满减显示时段，比例返不再一律显示时间范围。窄屏活动行使用不换行 + 横向滚动。[S5：244–280、637–653]

“比例返隐藏时间”是参考产品的展示选择，不能推出比例返永远没有时段限制。助手若未来展示时段，应按真实有效字段决定，不套用该结论。

## 我们能用什么

| 判断 | 项目 | 对助手的价值与限制 |
| --- | --- | --- |
| 已具备，继续保留 | 手动查询、未查询提示、上次结果 | 本地 `web/app.js:41–48、51–56、152–160` 已手动查、Tab 只筛本地结果；失败保留旧结果。无需为了跟上游而重写。[L2] |
| 已具备，规则更严格 | 满返 + 比例返同卡片 | 本地 `row` 已合并显示两侧活动，含来源、库存、金额与计算器；确认与候选分开。上游这次追上了部分展示需求，我们无需重复移植。[L1][L2] |
| 可借鉴，低优先 | 请求版本失效机制 | 如果以后允许查询中切位置、换条件、并发刷新，可自写“只接纳当前请求”校验；当前 Node/手机已有 busy 锁和位置锁，所以没有足够证据把它当成已发现的竞态缺陷。[S3][L3] |
| 可借鉴，轻量展示 | 活动级类型标签、分开列示满返/比例返 | 上游每行标类型有助扫读。助手当前已显示来源，可在后续界面整理时加强两类层次；不需要引入 Vue/Element Plus。[S5][L2] |
| 保留现有做法 | 分侧统计与推送数量反馈 | 上游新提示区分获取数与推送数；助手现有统计已经区分渠道、实际请求、有效门店、确认/候选及停止原因，继续保留这些比单一“查到 N 家”更有用。[S4][L2] |
| 当前不采纳 | 通知服务、同名自动合并、Tab/滚动自动采集 | 推送需要后端、任务配置和外部通知，超出当前“手机独立、按需查询”产品范围。按名称直接确认同店会降低现有准确性；滚动触发也改变当前有界手动查询体验。[S3][S4][S5][L1][L4] |

**建议**：前端这轮没有必须立即迁移的能力。优先保持现有查询、同店证据和失败保留机制；若要做一项小优化，可整理重合卡片里的“满返 / 比例返”视觉层次。请求失效机制等到允许并发交互时再引入，手动推送等用户确实需要提醒时单独立项。

## 许可与证据缺口

GitHub 仓库 API 本次返回 `license:null`；固定提交根树未列出 LICENSE/COPYING，README 与 package.json 未读到授权声明。[S6][S7] 这里只记录可见元数据和文件范围，没有声称经过全面法律分析或得到复制授权。建议借鉴行为与数据流，自行实现；本次没有复制第三方业务代码，也没有新增依赖。

没有启动该参考前端、没有真实推送、没有验证其分页覆盖或客户端超时后的后台任务状态。此类行为不能仅凭前端源码宣称验收。

## 来源

- [S1] [固定范围 GitHub compare](https://github.com/lyrric/xiaocan-front/compare/53f9ade65a1a5eadb05bbd5d9848ee49611234b4...f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1)。机器核对：`gh api repos/lyrric/xiaocan-front/compare/53f9ade65a1a5eadb05bbd5d9848ee49611234b4...main`，读取 ahead_by、commits、files。
- [S2] [router/index.ts，5–9 行](https://github.com/lyrric/xiaocan-front/blob/f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1/src/router/index.ts#L5-L9)。
- [S3] [HomeView.vue 固定源码](https://github.com/lyrric/xiaocan-front/blob/f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1/src/views/HomeView.vue)。请求版本与页面状态 25–26、316–360、364–415、628–735；生命周期 1199–1211。
- [S4] [MonitorConfigView.vue：269–305 行](https://github.com/lyrric/xiaocan-front/blob/f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1/src/views/MonitorConfigView.vue#L269-L305)，按钮 685–696 行。
- [S5] [PushedHistoryView.vue：25–55 行](https://github.com/lyrric/xiaocan-front/blob/f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1/src/views/PushedHistoryView.vue#L25-L55)，展示 244–280 行、样式 637–653 行；[通知类型](https://github.com/lyrric/xiaocan-front/blob/f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1/src/views/NotifyHistoryView.vue#L26-L33)。
- [S6] [仓库 API](https://api.github.com/repos/lyrric/xiaocan-front)，[固定根树 API](https://api.github.com/repos/lyrric/xiaocan-front/git/trees/f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1)。
- [S7] [固定 README](https://github.com/lyrric/xiaocan-front/blob/f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1/README.md)，[固定 package.json](https://github.com/lyrric/xiaocan-front/blob/f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1/package.json)。
- [L1] 本地 `core.mjs:86–96`，明确门店 ID 冲突不合并，同名仅候选；`web/app.js:34–39` 分别展示确认和候选。
- [L2] 本地 `web/app.js:25–48、51–56、89–118、152–167`，活动行、手动查询、渠道统计和计算器。
- [L3] 本地 `server.mjs:111–142`、`android/mobile/api-engine.mjs:67–75` 查询锁与 queryId；`web/app.js:190–211` 定位/搜索互斥。
- [L4] 本地 `PRODUCT.md` 的用户目标、当前能力和不做/不承诺。
