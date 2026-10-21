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

## 多标签交易：本地候选，尚未正常激活

- 每个登录启动表单拥有签名返回意图和独立 CSRF cookie；每次提交又拥有独立 Auth.js state／PKCE／nonce namespace。同一浏览器的两个表单和两个返回目标不共用临时槽位。
- IAM 密码表单每次渲染各有独立短期 proof，同一个签名链接的两个首次渲染也不覆盖。绑定通过后才原子消费；错误 query、issuer 或 proof 不烧掉合法表单。
- 已消费终态只清自己的临时 cookie；未证明失败不清其他交易或正式会话。过期密码表单停在产品结果页，不自动重发凭据，用户显式发起新的登录。
- 一个浏览器仍共享一个正式账户会话，不是每标签多账号。Consent／invitation 流程本次不改。

真实 Next／Redis 已验证冷启动两个返回目标、callback 正反序与错 proof 后原交易可继续；IAM 表单及完整 App 回归分开记录。正常环境仍为此前版本，完成整片验证和加载前，不把本地候选称为线上已修复。

## 尚未关闭的交互问题

正常环境的多标签竞态仍需加载候选并做真实双标签密码登录验收。登录页的原生签名 query 和原生退出确认页仍是体验收口项；当前 scope 配对、失败返回与本地隔离实现不代表全部登录、Skills、后台或 MCP 完成。
