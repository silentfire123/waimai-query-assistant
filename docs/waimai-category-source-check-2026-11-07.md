# 歪麦满返／比例返分类与美团筛选：源码核对

- 研究日期：2026-11-07；核对时间：2026-11-07 03:11:12（America/Los_Angeles，UTC−08:00）。
- 范围：本地白名单源码／文档、lyrric 的公开 Java 客户端及其关联 UI；只读检索，不调用歪麦业务接口、不执行上游脚本、不安装依赖、不读取本地 data/、.env 或凭证文件。唯一写入文件为本文。
- 本地源码基线：`cf3269adca8cf8e01dac6f92c2bfc361de52896d`；对应工作树文件行号以下注明。未修改生产源码。
- 证据层级：这些公开项目是其作者本人维护的参考实现（对其客户端行为属于第一手代码），**不是歪麦或美团平台的官方接口契约**。本文未取得平台官方字段规范，不能据此保证服务端当前接受、执行或长期支持某筛选值。

## 一、立即可用结论

**未找到明确按满返／比例返筛选的请求字段及可靠取值映射。停止扩展搜索，不以“未找到”冒充“平台一定没有”。**

1. 请求构造明确发送 `userTypes: [1,2,3]`、`tabType: "bwc"`、`takeawayPlatform: ""`；没有发送 `shopPlatformType`。[S1]
2. `shopPlatformType` 是返回门店上的分类字段：注释写 `1=满减、2=百分比返现`；执行代码把 `1/3` 归入满减分支，其他值兜底归赏金。因此“3 属满减”是参考客户端行为；不能进一步声称平台对 3 的官方业务定义已获证实，更不能把未知类型照此兜底。[S2]
3. 响应 SKU 上的 `takeawayPlatform: "meituan"` 明确被映射为美团；这不等于同名请求字段的服务端过滤值已验证。客户端内部展示数值 `type=1` 也不等于请求该字段应填数字 1。[S2][S3][S7]
4. `userTypes` 子集 `[1,3]`／`[2]` 与请求 `takeawayPlatform: "meituan"` **仅列为待验证候选假设**。未发现 `userTypes` 对应 `shopPlatformType` 的代码或文档，也未发现它另有明确含义；不得猜测其为会员类型、用户类型或活动类型。[S1][S2][S4][S6]

## 二、最新与固定快照

| 项目 | 本次读取到的 HEAD/main | 核对方式 |
| --- | --- | --- |
| lyrric/xiaochan | `7e2db82ad6095701889255b8994b4823b5ddab05` | `git ls-remote` 的 HEAD 与 refs/heads/main 一致；GitHub 源码树 currentOid 一致 |
| lyrric/xiaocan-front | `53f9ade65a1a5eadb05bbd5d9848ee49611234b4` | 同上；由后端 README.md 第 6 行所链接的关联前端定位 [S8] |

本地 THIRD_PARTY.md 第 12 行记录的固定快照正是上述后端 commit。本次分别读取 main 与固定 commit 的 WmmtHttp.java，文本完全一致；所以此次“最新”和“固定快照”没有字段差异。该结论仅覆盖检索时刻，main 仍会移动。[S1][L1]

固定文件 SHA-256（UTF-8 文本）：

- WmmtHttp.java：`a4ea25a8e01a9c7533b81c1f0527c8cd939d81bd950e47987bf53528629c35c5`。
- 前端 HomeView.vue：`51edebc9aa76995bfdd4dd9881c48dce39f65b6cad686a09b0ebe77c2d0e275b`。

所有上游引用均固定到完整 commit；行号按原始源码包含空行计数，不采用搜索摘要折叠后的行号。

## 三、请求字段证据表

下表“已知”指**源码事实**，不是本研究完成了业务实测。

| 字段 | 实际方向／源码值 | 可确认事实 | 未知边界 |
| --- | --- | --- | --- |
| userTypes | 请求；数组 [1,2,3] | 在构造器中硬编码，单处出现 [S1] | 各成员含义、是否支持子集、是否对应返现分类均未知 |
| tabType | 请求；字符串 "bwc" | 在构造器中硬编码，单处出现 [S1] | 没有 UI 选项、枚举或另一标签值；不把缩写自行解释为分类协议 |
| shopPlatformType | 响应门店；读取 1/3，其余走 else | 用于解析后的满减／赏金分类 [S2] | 未见请求构造、DTO 或 UI 传递；不得补入请求当作已知过滤字段 |
| takeawayPlatform | 请求 ""；响应 SKU 字符串 | 请求默认空串；响应 "meituan" 被映射为美团 [S1][S3] | 请求侧 "meituan" 是否生效、空串是否正式表示全平台、支持值枚举均未被源码证明 |
| categoryId / packageType | 请求；均为 "" | 仅见固定默认值 [S1] | 没有本研究可据以构造分类值的映射 |
| sortWay | 请求；"comprehensive" | 已有构造值 [S1] | 无证据支持把排序值用于满返／比例返分类 |
| secKillFlag / signUpFlag | 请求；1 / 2 | 已有构造值 [S1] | 不根据字段名推导每个数字的业务含义 |
| highRebatesFlag / noCommentFlag | 请求；0 / 0 | 已有构造值 [S1] | 开关的全部取值与行为未确认 |
| threeKmFlag | 请求；"" | 已有构造值 [S1] | 不推测空串、0、1 的半径语义 |
| scrollPageData | 请求及响应游标；首页 null、后续透传 | Java 与 UI 都按完整返回对象透传 [S1][S2][S6] | 验证时应从新首页开始以控制变量；跨筛选游标兼容性未验证 |

“默认空串会得到混合平台”的运行证据来自主线程，而非仅从空串本身推断，详见第六节。

## 四、UI 与服务端调用链：分类是取回后处理，不是 UI 分类参数

### 关联参考 UI

- HomeView.vue 第 90–97 行的歪麦表单只有 `name, latitude, longitude, locationId, scrollPageData`；不含 userTypes、tabType、shopPlatformType、takeawayPlatform。[S6]
- 第 397–426 行：重查清空游标、同步位置；第 413 行 POST `/api/wmmt/shopList`；第 424 行把返回游标原样放回表单。这里是参考应用自己的后端路由，**不是平台官方路径文档**。[S6]
- 第 1170–1185 行 UI 仅有“小蚕满减”“小蚕赏金”“歪麦”等入口；没有把歪麦拆成两个请求标签。第 573–574 行的“歪麦满减／歪麦赏金”是响应枚举显示名，不是请求参数。[S6]
- 第 782–784 行显示映射为 1=美团、2=饿了么、3=京东；该数值是参考客户端内部 `type`，不能套用到 userTypes、shopPlatformType 或请求平台字段。[S7]

### 参考 Java 后端

- WmmtShopListDTO.java 第 10–38 行只接收上述五个表单字段；WmmtHttp.java 第 144–146 行只把名称、坐标、游标向下传递。WmmtController.java 第 18、27–29 行对应 UI 的后端入口。[S4][S5][S1]
- **反向证据**：WmmtServiceImpl.java 第 71–98 行的 `fetchWmStoreInfos(storeType,...)` 虽接收 storeType，但先用同一个 DTO 累积取回列表，到第 96–98 行才对 `getStoreTypeEnum()==storeType` 做本地过滤，并未转成上游分类参数。这能排除把该方法签名误读为已有分类请求能力。[S9]
- StoreTypeEnum.java 第 23–31 行将 `WM_MANJIAN` 命名为“歪卖满减”、`WM_MTSJ` 命名为“歪卖美团赏金”。这是参考实现术语，不足以证明其每个比例 SKU 都属于美团；平台仍须看 SKU 级字段。[S10][S2]
- 平台解析 `getType` 仅明确匹配 "meituan" 和 "ele"，其余 default 返回 3。不能据此宣称任意未知平台字符串都是京东，也不能认定京东的原始字符串值。[S3]

### 当前本地适配

- waimai-client.node.mjs 第 21 行沿用混合默认请求：takeawayPlatform 空串、userTypes [1,2,3]、tabType bwc。[L2]
- waimai.mjs 第 8–13 行先仅接受 shopPlatformType 1/2/3，再在 SKU 层只保留 takeawayPlatform 为 meituan 的项目；1/3 进入 full，2 进入 ratio。这里是本地返回后分类，不是分开向上游请求。[L3]
- web/index.html 第 15 行的“实付满返／比例返”是结果标签；web/app.js 第 33–37、156 行从现有 report 中选 fullStores／ratioStores 并重新渲染，不会因此生成歪麦分类请求。[L4]

## 五、供主线程有限验证的两类假设（未执行，非官方契约）

| 假设类 | 仅供验证的候选变化 | 证据与风险 |
| --- | --- | --- |
| H1：userTypes 是返现类型筛选 | 相对已成功基线，仅将 userTypes 改为 [1,3] 或 [2] | **映射未经证实**。数字来自响应分类的组合，不能据此断言请求数组语义相同；服务端可能忽略、按其他含义解释或报错。尚未发现能证实“实际另有含义”的代码。 |
| H2：请求平台字段支持美团筛选 | 相对同一基线，仅将 takeawayPlatform 改为 "meituan" | 字段存在于请求，字符串存在于响应平台映射；但二者可共享值域仍是**假设**，不是已验证过滤契约。 |

验证读取边界：

1. 每次只改一个维度，其他字段和位置保持主线程已成功基线；不同假设首页均从 scrollPageData=null 起，不串用游标。这里是控制变量建议，不是平台承诺。
2. 在原始响应 `data.data[]` 统计店级 shopPlatformType，并在 `overbearfoodList[]` 统计 SKU 级 takeawayPlatform；**不要只看本地 normalizeWaimai 结果**，后者本来就删掉非美团和未知类型，会制造筛选成功假象。[S2][L3]
3. 成功码、空列表或单页恰好单一类型都不能证明筛选有效。若 H1 目标页仍出现相反的 1/2 类，或 H2 仍出现非美团 SKU，则该简单假设不成立或该层未完全过滤；有限样本不能进一步证明服务端是“忽略参数”还是存在其他契约。
4. 不添加 shopPlatformType 请求字段，不猜 tabType 的其他值；不对 userTypes 宣称未经发现的替代语义。本研究不请求业务接口，实际预算、执行和结论由主线程负责。

## 六、主线程实测输入与证据缺口

用户／主线程在本研究期间告知：匿名现有混合两页成功（1 配置 + 2 列表）；两页中有 type1/type2 与美团／饿了么／京东。**这是主线程报告的运行观察，本研究未读取原始响应、日志、data/ 或凭证，也未独立复验。**它支持该次基线返回混合分类和平台，不证明分类参数语义、分类请求已成功或任意地点均混合。

仍未知：userTypes 的正式业务含义；[1,3]/[2] 是否有效；请求 takeawayPlatform 是否支持 meituan；tabType 的完整值域；type3 的平台正式定义；未知类型及平台的正确分类；服务端是否静默忽略未支持值。未发现官方字段规范，也未穷尽全部公开历史或官方小程序产物。

本次检索在固定 Java 调用链与其 README 链接的关联 UI 处收束；GitHub REST 元数据请求返回 403 后，改用公开源码树、raw 文件和 git ls-remote，没有尝试认证。未抓取官方小程序、未解析凭证、未执行不可信脚本。**“未找到”仅限定本次可见源码范围。**

## 七、固定引用索引

- [S1] [WmmtHttp.java 请求入口 144–146 行](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/http/WmmtHttp.java#L144-L146)；[请求构造 188–208 行](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/http/WmmtHttp.java#L188-L208)。
- [S2] [WmmtHttp.java 响应游标、店级分类与 SKU 解析 298–355 行](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/http/WmmtHttp.java#L298-L355)。
- [S3] [WmmtHttp.java getType 388–394 行](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/http/WmmtHttp.java#L388-L394)。
- [S4] [WmmtShopListDTO.java 10–38 行](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/model/dto/WmmtShopListDTO.java#L10-L38)。
- [S5] [WmmtController.java 18–29 行](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/controller/WmmtController.java#L18-L29)。
- [S6] HomeView.vue：[表单 90–97 行](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L90-L97)；[请求与分页 397–426 行](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L397-L426)；[分类显示名 573–574 行](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L573-L574)；[入口 1170–1185 行](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L1170-L1185)。
- [S7] [HomeView.vue 内部平台显示映射 782–784 行](https://github.com/lyrric/xiaocan-front/blob/53f9ade65a1a5eadb05bbd5d9848ee49611234b4/src/views/HomeView.vue#L782-L784)。
- [S8] [后端 README.md 第 6 行：关联前端链接](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/README.md#L6-L6)。
- [S9] [WmmtServiceImpl.java 71–98 行：先取回再按 storeType 过滤](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/service/impl/WmmtServiceImpl.java#L71-L98)。
- [S10] [StoreTypeEnum.java 23–31 行](https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/model/enums/StoreTypeEnum.java#L23-L31)。
- [L1] 本地 `D:/zcode-worker/waimai-assistant/THIRD_PARTY.md:10–12`。
- [L2] 本地 `D:/zcode-worker/waimai-assistant/waimai-client.node.mjs:21`。
- [L3] 本地 `D:/zcode-worker/waimai-assistant/waimai.mjs:8–13`。
- [L4] 本地 `D:/zcode-worker/waimai-assistant/web/index.html:15`；`D:/zcode-worker/waimai-assistant/web/app.js:33–37,156`。
