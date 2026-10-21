# 登录与登录恢复

## 用户操作

从产品登录入口输入现有 Kokoro 账户。登录完成返回原来的产品页面。认证协议由系统内部处理，不要求用户填写 scope、回调地址或 token。

OAuth 回调或授权服务失败时，产品显示统一结果页。页面不会自动重复登录，也不会更改已有内容；用户可选择返回登录或首页。重新登录是新的交易，过期回调链接不作为登录入口。

## 内部维护

- App 拥有 Product 会话及同源登录页面，IAM 拥有身份认证和 OAuth client/resource。不要用跨库写入修复权限。
- `invalid_scope` 是环境或版本配对故障，不是密码错误。核对当前 App 的 `OIDC_SCOPE`、运行 IAM discovery 以及正式 Product Web client/resource 的已登记 scope。
- 账户会话读取／撤销及姓名保存分别依赖 `iam:account-session.read`、`iam:account-session.revoke`、`iam:account-profile.write`。使用 IAM 既有 scope read／extend 管理入口，先读取和核对旧状态，按该 owner 的演进顺序处理；不删 App 所需权限或给所有 client 放开权限。
- 顶层 HTML 登录失败返回固定 `/auth/sign-in/failed`；API 继续返回失败 status 和脱敏 JSON。回调的 code、state、issuer 描述和 cookie 不转入结果页或文档。
- 通过 issuer/state/PKCE/nonce 绑定后才创建正式会话。失败不伪造成功、不恢复旧 state、不清理其他并行登录的 cookie；未知 token 结果不自动重发。

## 验收要求

新登录成功并回原目标；错误／过期／重复回调只显示产品结果；API 失败仍失败；较新登录和原会话不被旧回调破坏；刷新结果页不新增认证请求。环境配对和页面验收需要分别有证据，服务健康或旧会话成功不替代新登录验收。

本页维护已实现交互及验收口径，未声称本轮所有登录、Skills、后台或 MCP 已完成。机器配置、会话与原始网络材料不进入仓库。

## 本地候选：避免错误回调消耗合法交易

已将“验证后原子消费”接入现有 state ledger，错配 proof 不再先删除合法交易；并发仍只有一个回调进入 token exchange。相关回归与真实 Next／Redis HTTP 验收分别记录，尚未激活到正常环境。该阶段不等于多标签 cookie 隔离完成。

## 尚未关闭的交互问题

本轮真实密码登录同时发现：多个标签并发进入登录时，现有共享交易／CSRF cookie 会互相干扰，可能让表单重新启动。刷新当前有效表单后可继续，不代表并发缺陷已修。后续需要在原有认证框架和 App 交易边界内完整收敛，保留 CSRF、state、PKCE、nonce、一次消费和并行交易保护，不通过删安全校验解决。

登录页仍携带原生签名 query，退出确认仍是原生页面；清爽地址和统一产品表达继续作为体验收口项。当前仅 invalid_scope 配对与失败返回已修，非全部登录体验完成。
