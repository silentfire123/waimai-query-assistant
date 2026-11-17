# 小蚕 HTTP 403 与参考协议差异排查

排查日期：2026-11-17，Asia/Shanghai。最新状态：比例返统一 feed 协议已在源码适配，154 项回归通过；匿名真实查询仍为 WAF 403，未发布新 APK。下文前半部分是修改前的排查基线，后续实施结果见末节。

## 结论

存在两个不同问题，不能把它们合并成一个已证实的根因：

1. 当前助手的小蚕请求被网关返回 HTTP 403 / WAF HTML 页面，尚未取得业务 JSON。满返首次失败后，比例返按设计不再请求；截图中的比例返 0 次不是比例返接口独立失败或空名单的证据。
2. 比例返协议确实落后于参考仓库。上游已将其迁到统一 feed 接口并改了请求体、平台筛选及游标读取。满返的 RPC 方法和协议版本则没有更换；仅添加新版平台筛选参数，真实请求仍返回 WAF 403。

用户在本次对话确认：同一部手机、同一网络，官方微信小蚕小程序的满返和比例返均可正常打开。此对照不支持“小蚕服务整体不可用”，但不能单独区分身份、请求头、传输特征或临时访问策略。

用户随后确认：助手从未填写 Silk ID / User ID，一直匿名使用。结合 `PhoneStore.publicConfig()` 和 `core.mjs:101`，助手此时两个身份字段默认均为字符串 `0`。本机匿名复现与用户描述的身份模式一致；“匿名访问受限”是待验证假设，尚未通过同一请求只替换本人身份的对照实验确认。

首次排查阶段没有修改业务代码。随后按参考源码适配比例返（见末节）；未修改手机凭证、重建或发布 APK。没有把参考作者的账号编号复制进应用，也没有进行身份、User-Agent、Referer 随机轮换或代理重试。

## 核对版本

| 项目 | 版本／固定提交 | 证据 |
| --- | --- | --- |
| 当前助手 | `1a799b56e4ebfc5209946103420ea5403b08da11`，APK versionName 1.0.4 | 本地 Git HEAD、AndroidManifest.xml |
| 之前使用的参考后端 | `7e2db82ad6095701889255b8994b4823b5ddab05` | 项目 THIRD_PARTY.md 及 11 月 7 日实施记录 |
| 本次参考后端 HEAD/main | `a90b9adbd46835aa65cf4a3369f8beddd5bff23b` | 11 月 17 日 `git ls-remote`，随后 fetch 固定 Git 对象；提交时间 11 月 16 日 14:45:22 +08:00 |
| 本次参考前端 HEAD/main | `f01ea60d7a9c8fc1b467c5b94ad0022b39e5a8e1` | 11 月 17 日 `git ls-remote`，仅确认引用，未运行该前端 |

`research/xiaochan` 的工作目录仍停留在旧提交 `8b1705198f870e10492494437e76766938c094cf`。本次只 fetch 并以 `git show <固定提交>:<文件>` 读取新版本，没有把旧工作目录当成当前源码。

本地 `core.mjs` 与 `android/build/assets/www/core.mjs` 的 SHA256 相同：`5c3cfb82c2e029e608cf8dad4d264025444bd130b63f5af08c8e0012cd20da86`。此项只证明本地打包资源一致，不是对手机已安装 APK 的远程取证。

## 协议逐项对照

| 项目 | 当前助手 | 参考后端固定版本 | 判断 |
| --- | --- | --- | --- |
| 网关 | `https://gw.xiaocantech.com/rpc` | 相同 | 没有发现新网关地址 |
| 版本 | `3.21.7.82` | 相同 | 不是简单改版本号 |
| 满返方法 | `SilkwormFusion / FusionService.GetFeedPromotions` | 相同 | 不能由提交标题推断满返换了 RPC |
| 满返响应 | `feed_items`，本地保留 source 1/2 的美团活动 | `feed_items`，参考只解析 source 1 和比例返 source 5 | 不应照抄参考的 source 2 漏采行为 |
| 平台限定 | `is_show_mt:true`，响应再校验平台 | 可传 `store_platforms:[1]` | 有明确请求字段差异；单变量实测未解决 403 |
| 比例返方法 | `FusionService.GetMeiTuanPromotions` | `FusionService.GetFeedPromotions` | 确认参考实现已迁移；不能据此断言旧 RPC 已停服 |
| 比例返请求 | `pv_id`，没有 offset/number/rebate_type | `rebate_type:2`、`store_platforms:[1]`、offset、number、page_pv_id、城市头 | 需要成组适配，不能只替换方法名 |
| 比例返响应 | 顶层 `list` 和 `pv_id` | `feed_items` 中 source 5；从最后一条解析活动取得 `page_pv_id` / `mt_pv_id` | 必须同步解析、游标、缺字段错误语义 |
| 签名计算 | 方法名摘要 + 时间 + nonce 的 MD5 | 相同 | 未发现算法变更 |
| 身份 | 匿名 0，或本机配置的本人成对 ID | 随机 Silk ID + 作者固定 User ID | 不是可直接复制的本人登录态 |
| 请求头 | 固定 Windows UA、固定 Referer | 11 月 10 日随机 UA；11 月 16 日随机 Referer 并改固定用户 ID | 尚无因果实验证明哪个字段触发本次 WAF |
| 会话 | 同轮查询保持 X-Session-Id | 逐请求生成 | 保留本地已回归的稳定分页会话，不能盲目回退 |

11 月 13 日提交标题中的“替换美团满减门店查询接口”不能替代源码调用链证据。完整 diff 显示，满返的 feed 常量保留，主要是比例返归并到同一列表入口。

## 复现与单变量结果

真实请求仅两次，均为匿名、只读、首个满返请求；没有真实比例返调用、没有翻页，也没有修改系统网络设置。使用本机原有已选位置在内存中构造请求，未打印或保存具体位置、身份、原始响应。

| 本地北京时间 | 操作 | 观测 |
| --- | --- | --- |
| 2026-11-17 18:41:42 | 当前生产 `queryLive(1)`，显式匿名 | 首次满返 WAF 403；full requests=1、ratio requests=0；两类有效门店均 0 |
| 2026-11-17 18:43:10 | 同一调用入口，仅给发送体添加 `store_platforms:[1]` | HTTP 403，Content-Type=text/html，含 WAF；仍只发 1 次，比例返跳过 |

由第二次观测可以否定“只要添加平台字段就能恢复本机满返请求”的预测。两次都失败不等于已证明匿名身份是唯一原因，更不能证明更换出口或参考作者身份会成功。

生产路径复现命令（会发送真实只读请求；不是自动重试脚本）：

```powershell
@'
import {queryLive} from './core.mjs';
process.env.XC_SILK_ID='0';
process.env.XC_USER_ID='0';
const result=await queryLive(1,{log:()=>{}});
console.log(JSON.stringify({protocol:result.protocol,errors:result.errors,
  fullRequests:result.pagination.full.requests,
  ratioRequests:result.pagination.ratio.requests},null,2));
process.exitCode=result.errors.length?2:0;
'@ | node --input-type=module
```

此外做了离线请求捕获：实际生产 `queryLive` 仍分别发送 feed 满返和旧专用比例返，比例返城市头为 0、请求仅含 lat/lon/silk_id/pv_id/scene/app_id。此捕获用虚构位置和合成响应，不是线上比例返成功证据。

## 已定位的失败链

1. `core.mjs:101` 默认匿名；`core.mjs:111` 生成当前请求头。
2. `core.mjs:204` 构造满返 feed 请求，`core.mjs:154` 发往固定小蚕网关。
3. 真实响应为 HTTP 403 / WAF HTML，`core.mjs:159` 标为 `UPSTREAM_WAF`，未进入 JSON 业务解析。
4. `core.mjs:267` 将停止原因设为 waf，`core.mjs:275` 停止共享网关后续类别。
5. 比例返记录 `SKIPPED_UPSTREAM_WAF`、请求数 0，与用户截图一致；歪麦是独立渠道，截图中仍取得 40 家。

已经定位到失败层及应用处理链；WAF 的具体触发条件未知，不能把这一未知项称为完整根因已确认。

## 后续处理条件

- 协议维护需覆盖：比例返统一 feed、平台筛选、城市头、offset/number、source 5 解析及条目游标；保持满返 source 2、零／未知库存、同店匹配、限页、无进展停止和 WAF 首次停止等现有行为。
- 比例返迁移可依据固定参考源码先做离线适配，但验证真实恢复仍需要本人正常访问条件下的新 feed 响应结构证据。当前 WAF 拦截未提供活动响应，不能把仅通过合成回归的 APK 宣称为已恢复。
- 用户已确认官方客户端可用且助手一直匿名。后续需要本人正常请求中与签名相关的字段形状和脱敏响应结构；不要在聊天或 Git 中贴具体编号、凭证或原始抓包。
- 官方小程序可用不代表第三方 App 已登录。已有两个 ID 也未被验证为完整登录态；本轮不保证填入 ID 就能解决。
- 当前 Android 只有手动保存两个 ID 的入口，没有小蚕账号登录流程。检查既有 `capture/saz_extract/raw` 中 443 份请求头，未找到发往 `gw.xiaocantech.com` 的请求；没有输出凭证、重放旧请求或修改旧抓包文件。现有样本无法提供小蚕正常登录请求对照。
- 用户表示抓包麻烦，本轮放弃这条采集路径；未修改代理、安装证书或读取微信私有存储。
- 已安装 App 不能通过本地更新文件自动升级；只有真实查询恢复并通过 Android 打包、签名及真机验证后，才应构建和发布下一版本。

## 来源与证据边界

- 参考后端固定版本：<https://github.com/lyrric/xiaochan/tree/a90b9adbd46835aa65cf4a3369f8beddd5bff23b>
- HTTP 实现：<https://github.com/lyrric/xiaochan/blob/a90b9adbd46835aa65cf4a3369f8beddd5bff23b/src/main/java/io/github/xiaocan/http/XiaochanHttp.java>，请求体 281–304 行、请求头 308–329 行、feed 解析 380–397 行。
- Service 比例返入口：同提交 `src/main/java/io/github/xiaocan/service/impl/XiaoChanServiceImpl.java` 的 `getRebateList`。
- 请求 DTO：同提交 `src/main/java/io/github/xiaocan/model/dto/XiaochanListDTO.java`。
- 最新请求头相关提交：`3eb3bd3db73993345b2548b17a3cf554368553ec`（11 月 16 日；已用 `git rev-parse` 核实）。
- GitHub REST Issues 查询遇到 403 / rateLimitRemaining=0，未取得 Issue 讨论；未把“没读到 Issue”解释为“没人遇到”。仓库源码通过 Git fetch 成功取得。
- 单变量脱敏结果：忽略目录 `data/diagnostics/xiaochan-20261117/current-shape-probe.json`。真实原始响应未落盘。
- 现有自动化回归：`npm test`，150/150 通过、无跳过；日志在忽略目录 `data/diagnostics/xiaochan-20261117/regression.log`。合成回归通过不代表真实 WAF 已解除。

## 后续实施：无需用户抓包的协议维护

- 用户认为采集麻烦，因此停止要求抓包，先在源码完成已证实的协议适配。两类使用同一 feed 方法、类别 1/2、平台 [1]、城市头、offset/number；比例返解析 source 5，取最后一条含活动条目的 page_pv_id。保持原有满返解析、库存口径、身份来源、会话稳定性、失败停止和旧导入兼容。
- 新协议测试先在旧代码失败，再在适配后通过；空活动尾项导致游标错误也经过先失败后修复。相关测试 83 项通过，最终全量 154/154 通过。隔离临时副本中的旧比例返方法、错误类别、错误平台和错误尾项游标四项变异均由断言捕获。
- 独立运行 QA：实际 CLI 和手机公开 API 调用真实 collectAll/core，在外部网络边界回放合成数据。10 组场景通过，含 20 个数据边界；已验证持久化和重启后 WAF 保留旧名单。没有实测物理 Android、Java HTTP/Keystore、浏览器视觉布局或新 APK 安装。
- `scripts/prepare-android.mjs` 公共资源打包通过，codeVersion=ffb87f48363c；已发布 1.0.4 APK 不变。
- 2026-11-17 19:54:19（北京时间），更新后的生产 queryLive(1) 匿名实测仍为满返 WAF 403、满返 1 请求／比例返 0 请求；业务响应未取得。脱敏证据在忽略目录 `data/diagnostics/xiaochan-20261117/feed-live-probe.json`。本次累计 3 次真实单页探测，不再重复重试。
- 协议适配与真实故障恢复是不同状态：前者已完成本地验证，后者未完成。没有凭证对照时，不能确认具体 WAF 条件，也没有已验证的匿名恢复办法。

- 最终审查：三个独立本地审查维度及三个外部只读复核完成。唯一 P3 重复结构校验已删除，坏响应仍由 feedItems 拒绝；最终全量 154/154 再次通过，公共资源重新生成。真实上游及真机缺口不变。
