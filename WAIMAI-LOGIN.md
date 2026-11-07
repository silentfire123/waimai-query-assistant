# 歪麦第3页登录接入

## 当前事实与边界
- 匿名实测前2页成功，第3次返回4000010（请登录）；第三方固定参考 lyrric/xiaochan 的 main/HEAD 于本轮再次核对为7e2db82ad6095701889255b8994b4823b5ddab05。
- 参考适配器接收请求头token，但没有独立App登录/短信/扫码流程。App登录态与此接口是否兼容，必须用本人的有效会话实测，不预先保证。
- 本次新增的是本机隐藏输入、限3页验证工具。没有读取手机或旧项目中的凭证，也没有完成本人登录态实测。它不会取得或生成token，不是官方授权入口。

## 取得凭证前的安全边界
只在用户知情选择后，对本人已登录歪麦App做一次定向请求调试。不要把密码、验证码、token、完整HAR/SAZ/PCAP或未脱敏请求头发给AI或聊天。

一种候选工具是PCAPdroid，需从作者emanuele-f/PCAPdroid官方仓库或其指向的渠道取得；尚未安装。其官方TLS解密说明要求mitm插件及本机生成的CA证书，并明确普通Android App可能不信任该证书。安装证书会扩大该调试工具的HTTPS解密能力，必须先取得用户同意。仅针对歪麦、短时间开启、结束删除新增证书与关闭捕获。若App拒绝证书/无法解密则停止，不root、不绕过证书固定、不安装改包，不保证一定取得token或账号零风险。

参考（公开原始资料）：
- https://github.com/lyrric/xiaochan/blob/7e2db82ad6095701889255b8994b4823b5ddab05/src/main/java/io/github/xiaocan/http/WmmtHttp.java
- https://github.com/emanuele-f/PCAPdroid
- https://emanuele-f.github.io/PCAPdroid/tls_decryption

目标是只在本机确认歪麦门店列表请求的token值。当前适配列表主机wmapp-api-v2.waimaimingtang.com，路径/api/bwc/waimaimt-web-bwc/shopIndex/getShopList；App实际主机/请求头需现场核对，不将小程序字段当成App已验证契约。

## 已有本人token后如何验证
在 PowerShell 中运行（此命令不包含凭证）：

```powershell
.\scripts\waimai-login.ps1
```

脚本会提示隐藏输入；只粘贴token值，不是完整请求，不把token写在命令参数里。当前实机执行策略是RemoteSigned；若其他机器提示禁止运行脚本，先核对其管理策略，不为此全局放宽执行策略。

默认仅做一次验证；加 -Start 可在第3页验证成功后启动本机8788服务。加 -Port 8789 可换端口。脚本先检查启动端口，不终止已有服务。数据使用data/local-login-preview独立副本；首次只复制已有位置与结果，不修改原数据。

凭证只进入当前进程与其Node子进程环境，结束恢复原环境；不写.env/配置/诊断文件。普通结果和位置仍按应用现有机制保存。环境变量仍可被同用户有权限的本机程序读取，因此不等于硬件隔离或内存擦除保证。

退出代码：0=本次第1–3页成功；2=缺凭证或接口仍要求登录；3=第3页前结束无法判断；1=其他失败。成功也不代表第4–20页、长期有效或账号不会触发风控。后续更大页数由用户手动查询，不自动扩页、不自动重试。

## 验证记录
当前使用虚构token和协议回放验证；本人真实凭证尚未提供。单元/CLI通过与真实登录成功是两件事。没有为了生成测试证据而安装证书、触碰手机登录态或请求本人账号。

工具回归覆盖：登录拒绝、缺凭证、重复分页游标不算成功、目录链接入口、成功后本机预览、端口占用、本地状态损坏，以及Windows PowerShell 5.1/PowerShell 7取消输入后恢复环境。协议回放与本人真实登录验收分开记录。

2026-11-06 本轮工具验收：本机全量90/90测试通过；独立QA在Windows PowerShell 5.1与PowerShell 7复验启动成功、登录拒绝、端口占用、重复游标、环境恢复、坏状态文件及目录链接入口，通过且无剩余FAIL。三轴修复复审无未关闭发现；外部Claude初审部分完成、Standards遇429，后续为OpenAI独立审查员host-only。原生隐藏输入呈现、真实Ctrl+C/关闭窗口，以及本人App凭证的第三页访问仍未实测。
