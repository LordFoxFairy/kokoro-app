# Kokoro User Web 技术设计

状态：当前架构与 W1C-2 目标设计，2026-09-23。W1C-2A 只读 GET relay、W1C-2B-1 sign-in
已发布；W1C-2B-2 tenant/consent 已发布。W1C-2C RP-only 已发布；W1C-2F-S1 Product Session 基础、Web Redis 双 CAS 与标准 session/signout route 已发布，S1 真实三仓 HTTPS 组合已通过；S2-A 普通业务代理组合待验。

W1C-2B-1 已发布 `/auth/sign-in` 的受控表单与两步 IAM sign-in/continue POST，不改变
`/iam/*` 直接 browser POST 全拒绝、旧认证路径或 Product Session。GET 保留原始签名 query 字节；Web
自有 Redis key 保存随机 token 摘要对应的目标 POST method/原始 query/issuer-cookie 绑定摘要，TTL 300 秒；POST
精确 Origin、Host、URL、Cookie/hidden token 配对后以 `GETDEL` 原子消耗，Redis 故障拒绝。
`redis@5.12.1` 与本组合 BFF 版本对齐并固定在 manifest/lockfile；仅 server-only
`src/lib/server/iam-interaction-csrf.ts` 与 2C 的 `oidc-rp-transaction.ts` 静态引入，架构测试限制 browser/import 越界。
`KOKORO_WEB_REDIS_URL` 仅服务端读取，Web origin 哈希隔离 key 前缀。不重签/归一化 IAM query，
中间 sign-in 失败仅返回受控 401/429/503，不透传原文 body/cookie，也不调用 continue。成功的
continue 原生 302 经 Location 校验保留；IAM 实际 200 `{redirect:true,url}` 必须通过精确 shape、
固定 Web origin 与允许交互路径校验，再转成无 body 的浏览器 303 导航，合法多 issuer cookie 保留。
测试只按本次随机 token 的精确 key 清理，不扫描/删除同前缀的其他 key。已发布的 2B-2 新增
`/auth/*` 外层引导与 `/iam/interactions/*` 真正 tenant/consent 表单；Product Session 仍属后续切片。

W1C-2C 已发布的**RP-only 基线**仅安装 RP transaction、callback、经固定 BFF relay 的 server-only token/userinfo。
Code+S256、state、nonce、固定 issuer/client/redirect URI/resource 验证成功后，因 Product Session
当时尚未安装，回调只返回受控 `503 product_session_unavailable` 并清除 RP 事务；S1 工作树成功回调改为建
Web 在线 Product Session、清 RP cookie 后 303 到 `/app`，失败/重放仍按原受控拒绝；不建立旧 sealed session，
不把 token、code、userinfo 正文或上游错误返回浏览器。Redis 仅保存一次性 RP state 摘要与短期事务绑定，
不保存 token/PII；S1 实现自身刷新/退出；S2-A 已切换普通 BFF Bearer 代理与 UI 登录/探针/退出主链，旧 route/Team 路径删除留给 S2-B。
IAM consent 成功的 callback 实际带唯一 `code`、`state`、`iss`；relay 和 RP 都只接收这三键且
`iss=${KOKORO_WEB_ORIGIN}/iam`，随后将完整 query 交 `openid-client` 再验证 issuer。
受控入口拒绝浏览器覆盖 `resource`、`scope`、`client_id`、`redirect_uri`、`callbackUrl`（含重复键），
固定 Web origin、`${KOKORO_WEB_ORIGIN}/iam` issuer、单 provider `kokoro-iam` 与唯一
`resource=https://kokoro.dev/resources/iam-internal`。Auth.js v4 自定义 `token.request` 必须
调用验证型 `openid-client` `client.callback(..., checks, {exchangeBody:{resource}})`；仅直接构造
`TokenSet` 不执行 ID token 签名/issuer/audience/nonce 校验。token Basic 与 userinfo Bearer 仅在
server-only BFF backchannel 加入，userinfo `sub` 与已验证 ID token `sub` 一致；浏览器直打
`/iam/oauth2/token|userinfo` 仍拒绝。Auth.js CSRF 与精确 Origin 叠加，Redis state `SET NX`
登记、`GETDEL` 一次消费，失联拒绝；回调/code 重放、错误与超时均不建会话。
IAM 实际 ID token 签名算法固定为 EdDSA；Auth.js client metadata 显式 pin `id_token_signed_response_alg=EdDSA`，
真实 Next fixture 同时提供 Ed25519 与 RSA JWK，RS256 即使签名正确也拒绝。token、userinfo、JWKS
分别经独立受限 Node Agent，绝对 5 秒和响应头/正文累计 1 MiB 上限，超限/慢滴流销毁 socket；
Route Handler 的 `request.signal` 传到 token/JWKS/userinfo Agent，浏览器中断时当前 BFF socket 即销毁、
后续 backchannel 不发起；不改 `openid-client` 全局默认或绕开验证型 callback。

## W1C-2：OIDC RP、Product Session 与同源 IAM 边界

### 当前事实与发布前置

当前 Web 的 `src/lib/server/auth.ts` 仍直接调用
`KOKORO_IAM_BASE_URL` 的 magic-link/refresh/team-session；`session-envelope.ts` 保存旧 sealed session，
`/api/auth/*` 与 `/api/team/*` 是旧路由，部分 `/api/*` 代理还发送自报 namespace/principal。
`sameOriginOk` 目前允许缺失 Origin。以下均是**待替换的当前态**，不是已接受的目标安全性质。

BFF relay 固定policy来源 commit `ddb462e6ab3a7270a3dab248ba7ee887b0ec9ba2`，其
`contract/iam-relay-policy.json` 当前 SHA-256 为
`bbd86696e1b36a82c1ebd35262dba3950a35d56d7d63856df217f397d8b48819`；policy version `1.0.0`
固定 IAM owner commit `f240bd7d5f542bb152c7eb929074c96b6c290ea8`。该 pin 已随 IAM test-only
fixture 更新；W1C-2A 已 vendor 只读 policy snapshot 并通过 consumer blob digest/provenance 漂移门，
但真实 Web→BFF→IAM 链与 Product Session 仍待后续验收。上游再发布时必须重新核验 BFF commit、policy blob
digest、IAM allowlist/snapshot digest，不能只改文档版本。Web 不复制 IAM schema 或编辑 BFF policy。

### Owner、组件与调用方向

```text
Browser ──同源 cookie──> Web Route Handler/Auth.js RP
  ├─ /iam/* ──Web service identity──> BFF 固定 IAM relay ──> IAM issuer
  └─ /api/* ──Web service identity + 单一 user Bearer──> BFF /v1/*
```

- IAM 独占 identity、issuer、OAuth client provisioning、access/refresh token、授权和撤销事实；BFF 独占
  `/iam` 准入 policy、普通 `/v1` admission 和 Product API；Web 独占 Auth.js RP、HttpOnly Product Session、
  browser-private 同源入口与 Web Redis 协调 key。Web 不访问 IAM URL、数据库或其他 owner 服务。
- `src/app/api/auth/[...nextauth]/route.ts` 只挂 Auth.js；`src/lib/server/oidc-provider.ts` 只定义
  provider/RP、受限 server-side token exchange；`oidc-token.ts` 只处理 refresh/revoke；
  `product-session.ts` 与 `product-session-store.ts` 分离请求态 cookie 与 Redis CAS/tombstone；
  `src/app/iam/[...path]/route.ts` 只按固定 BFF policy 代理原生 IAM 协议；
  `src/app/auth/sign-in/route.ts` 处理首个交互，`src/app/auth/{select-tenant,consent}/route.ts`
  只做外层引导，`src/app/iam/interactions/{select-tenant,consent}/route.ts` 在 issuer cookie
  `Path=/iam` 下处理其余原生交互页及已签 query 续接。
  普通 BFF adapter 归现有 `src/app/api/**/route.ts`，由共享 server-only 凭据读取边界注入 Bearer。
  不建 Web DB 模块、万能上游代理或第二套 IAM client。
- 上述放置优于把凭据放进 `src/contract/`（会污染 browser wire/schema）或 UI feature（会把 secret
  带入客户端）。现有 `src/lib/server/` 与 Next Route Handler 是稳定边界；RP、token、store、relay 分文件是
  因变更原因、运行权限和测试面不同，而不是模板式分层。
- Next 16.2.6 本地 `node_modules/next/dist/docs/01-app/` 的 Route Handler、authentication、cookies 指南
  已核对：handler 属于 `app/`，`cookies()` 是异步 request-time API，写/删 cookie 必须在 Route Handler 或
  Server Function 且 streaming 前完成；动态认证响应显式 `no-store`，Route Handler 与同 segment page 不并存。

### 登录、租户、刷新、退出状态机

1. IAM operator/provisioning 先创建并 readback `user_delegated` confidential client：
   `client_secret_basic`、`require_pkce=true`、`enable_end_session=true`、精确 Web callback/post-logout URI、
   `openid profile email offline_access iam:session-authorization.verify iam:member.read iam:invitation.read iam:role.read`
   scopes 和 internal resource binding。W1C-Team-R3-Web 保持原 scope 顺序，仅追加 IAM 已发布的三个
   Team 只读 scope；provider 授权请求与 RP 对 Auth.js authorization Location 的严格匹配使用同一固定值。
   不申请 Team 写权限，不改变 token callback 的既有验证语义，也不把申请 scope 当作授权事实；
   IAM/BFF 仍验证当前 membership、角色、权限与 token。旧 Team UI/直连及 relay policy 不在本片修改。
   issuer/discovery、`IAM_ISSUER_URL` 与 Web origin 必须精确匹配；不从浏览器 Host 推导 issuer。
2. Auth.js v4（本工作树精确固定 `next-auth@4.24.15`、`openid-client@5.7.1`，Node 22/Next 16 构建与真实 Next HTTP 已验证）执行 Authorization Code
   + S256 PKCE，保存并验证 state/nonce/PKCE；登录页、租户选择页、同意页承接 IAM 原生带签名 query，
   不消费、不重签 IAM 参数。callback code 单次使用并换取 token；失败清理 RP transaction 且不建立会话。
3. authorize、token、refresh 请求均发送**恰好一个**
   `resource=https://kokoro.dev/resources/iam-internal`。Web 入口拒绝或清除浏览器自报 `resource`；
   Auth.js v4 默认 callback 不保证 token request 带 resource，须以受限 `token.request`/OIDC client
   `exchangeBody` 和真实 wire 测试证明；refresh 由 Web server 显式 POST，使用 Basic 与唯一 resource。
   Bearer 的 audience、issuer、scope、subject/session 由 IAM/BFF 验证，不以 Web 解码结果授权。
4. **后续 Product Session 切片**在 callback 成功后建立 server-only Product Session：Auth.js 加密 HttpOnly
   cookie 只携随机 session ID、generation、当前 access 与必要 RP 退出提示，绝不放 refresh；公开 `session`
   callback 不输出 token。Web Redis 隔离记录 `active(g)`、`refreshing(g,reservation,deadline)` 或 `revoked`、
   固定到期及由 Web server-only 密钥加密的**当前** refresh；key、日志和公开响应无 token。请求先在线
   比对 Redis 当前 generation/tombstone，再向普通 BFF `/v1` 传唯一 Bearer。双阶段 CAS 从 `active(g)`
   原子预留，只有赢家向 IAM 发起**一次**固定 Basic/resource 的 refresh；收到新 token 后必须在
   reservation、deadline、未撤销条件下原子提交新加密 refresh 与 `active(g+1)`，才发送新 cookie。
   reserve 后 AAD 解密失败尽力按 reservation tombstone，Redis 不可用仍 fail closed；access UTF-8 ≤2048 B、refresh ≤8192 B、整数 `expires_in` 1–3600 s 且完整 Product Set-Cookie ≤4096 B，在 callback 建 Redis 前和 refresh finalize 前验证。竞争败者仅拒绝本请求，不撤销赢家、不清赢家 cookie，也不再次请求 IAM。pending、旧 generation、
   结果未知、Redis 故障均 fail closed；未决 reservation 到期只撤销，绝不恢复旧 active。finalize 成功
   或 Redis finalize ACK 未知时不发送新 cookie；即使 Redis 已提交 `active(g+1)`，旧 g 仍拒绝、用户
   重新登录，无客户端可达的 active record 按固定 TTL 回收；不依赖 IAM 的 replay 窗口恢复败者。
   cookie 的 `Path=/`、`SameSite=Lax`、`HttpOnly` 与固定 `KOKORO_WEB_ORIGIN=https:` **或** Web production mode 时 `Secure` 在创建/refresh/清除一致；该 Product 决策与 IAM issuer cookie 的 production 模式分离。
5. logout 从可信解封的 cookie 取得 session ID 与 generation；单次 Redis 原子 compare-and-tombstone 仅在当前记录 generation 匹配时修改记录。旧 generation 不发送 Product `Set-Cookie`（乱序删除 cookie 会损坏并发 refresh 赢家），HTTP 200 返回 `stale_session`/`not_required`；旧 cookie 仍因在线 generation 校验不可用，不写 tombstone、不删除当前记录、不 revoke，也不返回 issuer 确认引导；**仅在匹配 generation 且记录为 active 时** take 已确认当前的加密 refresh，经固定 BFF relay 单次
   有界尝试 IAM revoke；issuer end-session 必须另由浏览器确认，refresh revoke 不等于 issuer cookie 清除。若记录为 refreshing/pending，旧 refresh 可能已轮换，故只
   tombstone，不 take/发送旧 refresh 到 IAM，并报告远端撤销未确认。缺失记录也建立覆盖最大会话/在途
   窗口的 tombstone，迟到 finalize 不可复活；重复 logout 不重复远端 revoke。清 Web cookie；
   active 状态的远端失败也准确报告未确认；若 tombstone 写入 ACK 未知，清 cookie 仅表示本浏览器
   清除，不能报告服务端已撤销，也不在清 cookie 后声称可补偿重试。IAM 失联时远端 token/session
   仅靠 IAM owner TTL 兜底；UI 区分本地退出与远端未确认，不宣称全端退出。 S1 signout JSON 另返回固定同源 `issuer_end_session_url` 与 `issuer_session=pending_browser_confirmation`；浏览器 GET IAM 原生确认页后，POST `action=confirm` 到固定 `/iam/oauth2/end-session/confirm`，仅该路径透传 IAM 签名 confirmation cookie，Web 校验精确 Origin、Host、form 与固定参数，IAM 再验 cookie 的 session/TTL 并删除 issuer session。确认 POST 成功前不宣称 issuer 已退出；URL 不含任何 token。
   失效/撤销/tenant 切换后的 BFF 401/403 不得仅靠 Web 缓存视为已授权。

### `/iam` 和业务代理的安全边界

- Web 从最终固定 BFF policy 的 path+method 白名单判定 `/iam/*`；`/.well-known/*`、`/jwks` 等 issuer
  路由只能作为 `/iam` 下的原生协议路由。W1C-2A 的固定 server-only `KOKORO_WEB_ORIGIN` 必须是精确
  HTTP(S) origin（scheme、host、可选 port，无尾斜杠/路径/query/fragment）；入站 Host 精确等于配置
  host，GET 如带 Origin 则精确匹配，POST 必须带精确 Origin；Location 只相对固定 origin 验证。
  Next 反代后重建的 handler URL origin 可能是内部 localhost，不能代表浏览器公开 authority；也不从
  `Forwarded`/`X-Forwarded-*` 推导公开 origin。handler 可见的未知、
  大小写、编码 route alias，以及上游 Location 中的 `%`、dot segment、双斜线、backslash 均拒绝；真实
  Next HTTP 边界会在 handler 前把 dot/encoded-dot 输入规范化成同一个 canonical route，并对双斜线返回
  308、编码 route 名返回 404，因此文档不把框架前不可见的原始输入冒称为 handler 拒绝。任一情况都不扩张
  固定 allowlist、身份或响应内容。CRLF、超限 query/header/body 同样拒绝；不自动跟随 redirect。Web 原样
  保留合法 status、Location、
  Cache-Control、Content-Type、Retry-After、logout 安全 header 和多个 `Set-Cookie`，不把 OAuth 协议
  包进 Product `{data}`/`{error}` envelope。BFF policy 限制的 8 KiB query、64 KiB request、
  16 KiB header、1 MiB response、5 s duration 是 Web 不得放宽的上限；浏览器取消传播到 BFF。
  W1C-2A GET 不承载请求体；非零/异常 `Content-Length`、任意 `Transfer-Encoding` 或可观察 Request body
  都在 BFF socket 前拒绝。policy 保留的三个 `/auth/*` 交互 Location 在 2A 尚未安装；
  2B-1/2B-2 现已安装三页，但 RP callback 在 2C 前仍受控 503，不能将 relay 可达冒充登录可用。
- 入站浏览器的 Cookie 仅逐名保留 IAM 发布 snapshot 的 `kokoro-issuer.*` 与 production
  `__Secure-kokoro-issuer.*`；出站 `Set-Cookie` 再按同一 snapshot 与精确 `Path=/iam` 校验，logout
  confirmation cookie 只允许 `Path=/iam/oauth2/end-session/confirm`。Product Session/Auth.js cookie、
  浏览器自带 Basic/Bearer、任意 `Authorization`、内部 service secret 均不能进入 IAM；BFF service
  identity 只在 Web→BFF 跳使用。`/iam/oauth2/token`/revoke 的 Basic 只由受信 Web server 生成；
  userinfo Bearer 也只由 Web server 使用，不能让浏览器任选 token。
- 所有同源 cookie mutation，包括 `/iam` 交互 POST、Auth.js action、logout 与业务 `/api/*`，均要求
  精确同源 Origin 加框架/应用 CSRF 证据；缺失、`null` 或错误 Origin fail closed。Web 的
  `/auth/sign-in` 与静态 `/iam/interactions/{select-tenant,consent}` server-rendered 表单在 GET
  时为该 IAM 交互、目标 POST path 和短 TTL
  生成 Web 自有随机 CSRF token，放入 HttpOnly、SameSite=Lax、Secure（生产）cookie 与隐藏表单字段，
  token 摘要/交互绑定以短 TTL 存 Web Redis namespace，原子一次性消费，Redis down 即拒绝；
  浏览器 POST 到 Web-owned Server Action/Route Handler，Web 在发 BFF socket 前核对 Origin、cookie/字段、
  交互绑定及一次性消费，按 IAM 当前机器契约构造 `/iam/sign-in/email|organization/set-active|
  oauth2/consent|oauth2/continue` 的原生 body（Web CSRF 字段不入 IAM），原样携带 IAM 已签 query 与
  issuer cookie。浏览器直接 POST 这些 `/iam` 路由而没有 Web action 证明一律拒绝。其他允许的
  browser `/iam` POST（authorize、sign-out）
  也必须由 Web 呈现并核验等价 token，或证明 IAM 自带原生 CSRF 的生成/携带/校验且再加精确 Origin；
  两者均无证据时拒绝，不能因为在 relay allowlist 就免除 CSRF。`end-session/confirm` 是已验证的窄例外：Better Auth 1.7.3 GET 签发限时签名 confirmation cookie，IAM POST 验签并绑定 session；Web 仅放行 `action=confirm`、精确 Origin/Host 与该路径 cookie，不放行通用 POST；确认表单读取限 1024 B 且应用层硬截止 5 秒，超时/断连不向 BFF 发起请求。真实 Next 在请求 body 尚未收齐时可能先于 handler 缓冲，HTTP 慢滴流只据实证明未触发 BFF，不冒称 handler 已返回超时。Auth.js action 使用其自身 CSRF
  token 校验并叠加 Web Origin；普通业务 mutation 使用 Web 自有 CSRF 防护。仅可信 server-to-server
  token/revoke 调用走独立 server-only 凭据路径，不借浏览器请求例外。BFF 还独立验证 Web service 身份
  与 relay Origin；Web 不把 `Forwarded` 当身份。

W1C-2B-2 的 IAM 固定外层 `/auth/select-tenant|consent` 只安装严格 GET，无状态 302 到静态
`/iam/interactions/select-tenant|consent` 并保持签名 query；POST 405。IAM issuer cookie 仍为
`Path=/iam`，因此真正 Web-owned GET/POST 表单位于该路径内，静态路由优先于 `/iam/[...path]`
只读 catch-all，但不开放直接 owner mutation。Tenant 候选从 BFF 固定 `/iam/organization/list` 取 active 组织，
候选 ID 串参加 Web CSRF 摘要绑定；POST 对用户所选 ID 先比对已呈现候选，再向 owner 重读当前
列表并确认资格，随后才向 `/iam/organization/set-active` 发送 IAM 原生 body。Consent 的 scope
来自跳转 query 的唯一受限字段，在 GET 页面只标为**未验签预览**，不构成 Web 授权判断；POST
不接受任何浏览器 scope 字段，只在明确 Agree 且一次性 CSRF/原始 query 匹配后提交
`{accept:true,scope,oauth_query}`，由 IAM 对完整 query 的签名、到期和 scope 子集作最终判定。
两路中间 200 `{redirect:true,url}`/302 限定固定 Web origin 的三条交互路径，合法多 issuer
`Set-Cookie` 原生保留，错误 body/cookie 一律清洗。IAM 最终指向固定
`/api/auth/callback/kokoro-iam` 时，2C 前没有 Auth.js RP，Web 只回受控 503，不泄露 code、
Location、Set-Cookie；回调导航待 RP 切片安装和验证后才开放。
- `/api/{session,hub,agents,scheduled-tasks,billing,team,...}` 的受保护 BFF `/v1` 路由统一从 Product
  Session 提取**单一** access Bearer，另加 Web service identity；删去 `x-kokoro-namespace`、
  `x-kokoro-principal-id`、浏览器 Authorization/cookie 透传。service-only runtime manifest 与公开 Share
  按 BFF 明确例外各自测试，不伪造 user Bearer 或把 public route 变成登录依赖。
- `src/lib/server/auth.ts`、`session-envelope.ts`、旧 `/api/auth/{magic-link/request,callback,logout,session-state}`、
  `/api/team/*` 的 magic-link/team-session 路径及旧 `/auth/refresh` 必须逐调用点删除或按新职责替换；
  不保留旧 endpoint alias、旧环境变量读取、双轨 cookie/refresh 或 IAM 直连 fallback。

### 失败恢复、契约与门禁

Web 本片不新增 SQL 表、migration 或数据库事务。Redis CAS 是 Web 会话协调的原子边界，IAM 仍拥有
token/session 权威事实；业务事务、幂等 receipt 与 durable AG-UI cursor 仍在 BFF。受控代理的连接、读取、
总体 deadline 和 body cap 必须覆盖慢请求；只有 BFF owner 明确标为安全的幂等操作才重试，token exchange
与业务 mutation 不做猜测性重试。错误映射不得泄露 authorization code、token、secret、cookie、IAM 原文堆栈；日志只含
request_id、operation、result、duration 等非敏感字段。

实施与验收顺序：W1C-2A 已用 Web contract test 核验 vendor snapshot 的固定 digest、provenance、结构
不变量与篡改负例，并用真实 Next HTTP 测试记录 canonicalization；Root 仍负责从固定 BFF commit blob
复核源字节。后续再做
`tests/server/{oidc-provider,product-session-store}`、`tests/system/{iam-relay-http,auth-browser-login}`、现有
proxy/architecture/UI/Playwright 回归；执行 `pnpm contract`、`pnpm test:architecture`、`pnpm lint`、
`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:e2e`，最后由 Root 在隔离 fixture 进行真实
Web→BFF→IAM 首次登录、tenant/consent、callback、refresh 竞争、logout/revoke、越权、异常/超时与
浏览器 cookie/header 泄漏组合测试。虽 IAM fixture 与 BFF repin 已发布，Web consumer 与真实组合证据未完成前，
本设计不构成 W1C 验收。Product OpenAPI generated consumer/AG-UI 单一 transport 属后续 W1D，
不得因本登录链可用而激活整个 EDGE-WEB-BFF。

## 1. 目标与范围

`kokoro` 是单一产品的 User Web 和同源 adapter。设计目标是让浏览器只理解 Web 可见模型，让
身份、业务事实、持久化、执行和跨 owner 编排保留在后端 owner。本文不把未来目标冒充当前实现；
差异统一列在 [`CURRENT.md`](CURRENT.md)。

## 2. Owner 与依赖方向

```text
Browser UI
  -> browser clients / Web state adapters
  -> Next.js same-origin interfaces (/api/*)
  -> kokoro-bff public Product API (/v1/*)
  -> internal owner APIs / Agent / Scheduler
```

| 层 | 本仓职责 | 禁止事项 |
| --- | --- | --- |
| Browser presentation | route、React surface、view state、可访问交互 | 读取 server secret、tenant/site selector、内部 URL |
| Browser application | Chat transport、reducer、query/mutation adapter、preview fixture | 建立第二条网络协议、把 localStorage 当业务事实源 |
| Contract boundary | Zod parse、AG-UI parse、path helper、DTO mapper | 在 UI 组件复制 JSON shape、把 generated wire type 当 view model |
| Same-origin interfaces | cookie、Origin、header 清洗、BFF envelope、stream proxy | SQL、业务状态机、跨 owner 编排、直连 owner 终态 |
| Bootstrap/config | server-only 环境读取和 client 装配 | 把服务地址或 secret 打入 browser bundle |

Web 不需要服务端 DDD 的空目录模板；关键约束是 Browser、server adapter、contract 和 UI 状态之间
依赖清晰。服务端业务 DDD 层属于 BFF/owner 仓。

## 3. 组件

### 3.1 Next.js 与同源 adapter

- `src/app/` 提供页面和 route handler。
- `src/lib/server/auth.ts` 管理 session envelope 与认证辅助逻辑。
- `src/lib/server/domain-context.ts` 从 `KOKORO_DOMAIN` 构造可信 `Forwarded`。
- `src/lib/server/upstream-http.ts` 清洗 browser-controlled forwarding/tenant header 后发往上游。
- `src/lib/server/bff-response.ts` 负责 BFF envelope、request id 与 no-store 响应的公共部分。

当前多数业务 route 已走 `KOKORO_BFF_BASE_URL`，认证仍直连 IAM。终态要求全部 owner 访问经 BFF
明确 adapter 完成，Web 不保存 owner base URL。

### 3.2 Chat 数据流

目标数据流：

```text
POST command + Idempotency-Key
  -> BFF receipt
  -> snapshot / durable AG-UI SSE
  -> AgUiChatTransport
  -> UIMessage parts / local reducer projection
  -> React rendering
```

- BFF 拥有 Conversation、Message、receipt、durable AG-UI ledger 和 cursor。
- Web 发送 command，依据 receipt 与 event reconciliation 收敛 optimistic state。
- `Last-Event-ID` 携带 BFF durable cursor；断线从下一条事件恢复。
- AG-UI 是唯一网络事件 union。Kokoro domain artifact/delivery 可使用有命名空间的 `CUSTOM`，但标准
  Run/Text/Tool/Reasoning/Activity/Subagent/Interrupt 事件优先。
- `AgUiChatTransport` 和 Vercel AI SDK `UIMessage` 是 Web 内部适配；它们不发布 endpoint，不拥有
  durable cursor，不定义第二个 resumable stream。

当前 `parseAgUiEvent` 会把 AG-UI 投影为旧 reducer `SessionEvent`，而 network client 仍双读两种
wire；这是迁移状态，不是终态设计。

### 3.3 Browser state 与 preview

- live snapshot/event 是服务端事实；localStorage 只能缓存 UI preference、draft 或有限本地投影。
- `src/dev/` 的 preview transport 仅用于 local/test，必须由显式 preview 配置选择。
- live 请求失败保持 unavailable/error，不回退 preview fixture。
- URL 是可分享/可恢复页面状态的首选；敏感 token 不进入 URL、localStorage 或客户端日志。

## 4. 契约边界

| 契约 | Owner | Visibility | 当前来源 |
| --- | --- | --- | --- |
| Web `/api/*` | `kokoro` | `browser-private` | route + `src/contract` + tests |
| BFF `/v1/*` Product API | `kokoro-bff` | `public` 或 BFF 定义的受限面 | BFF 自有 OpenAPI artifact |
| Web↔BFF Agent events | `kokoro-bff` | Web 消费的 AG-UI | BFF contract + `@ag-ui/core` + Web narrowing parser |
| BFF↔owner/Agent/Scheduler | 各事实 owner | `internal-owner` / `event-protocol` | owner 自有 contract |
| `src/generated/proto/*` | 历史 consumer snapshot | 不发布 | 冻结 provenance；当前不可再生 |

Web 不复制 BFF OpenAPI，也不把同源 contract 放进 Developer API。详细策略见
[`API_CONTRACT.md`](API_CONTRACT.md) 和 [`../contract/README.md`](../contract/README.md)。

## 5. 身份与安全

1. 浏览器仅自动携带同源 cookie。
2. 当前 Web 解封旧 HttpOnly session envelope；W1C-2 目标改为 Auth.js Product Session 加 Redis 在线 generation 核验后取得 server-only access Bearer。
3. mutation 执行同源检查；上游 header 从 allowlist 重建。
4. Web 注入 service identity、request id 和部署域名上下文。
5. BFF 重新执行认证、授权、tenant isolation 和 owner 调用；Web 的展示状态不构成授权。

`Forwarded` 是路由上下文，不是认证凭据。详细 threat boundary 见 [`SECURITY.md`](SECURITY.md)。

## 6. 失败、重试与恢复

- JSON：外部 unknown 先过 Zod，再进入 Web 状态。
- SSE：非法 frame fail-loud；网络断流按 durable cursor 重连；不能切换到另一协议或 fixture。
- mutation：只有具备幂等 identity 时才可重试。
- error：保持稳定 code、request id 和适当 HTTP status，不回传堆栈、SQL、token 或 provider 原文。
- cache：身份相关 JSON/SSE 默认 `private, no-store`；只对内容寻址静态资源使用公共缓存。
- shutdown：浏览器 abort 应传播到 Web/BFF；server transport 仍需补 connect/read/overall timeout。

完整运行策略见 [`RELIABILITY.md`](RELIABILITY.md)。

## 7. 部署

- Node 22 standalone Docker image 或 OpenNext/Cloudflare Worker。
- 一个仓库对应一个产品发布单元；域名由运行时环境注入，不在 React/CSS 中分支。
- 本地应用从 `pnpm dev` 启动；容器用于 release candidate/smoke，不替代源码验证。
- 当前 Docker/CI 已按 [`CURRENT.md`](CURRENT.md) 固定 base image digest、非 root/HEALTHCHECK、完整 action SHA、
  候选镜像扫描、SBOM/provenance 与 digest 签名；这些仓内配置不等于本轮镜像已发布或生产 SLO 已实测。

## 8. 变更顺序

1. 先更新本仓 browser-private contract/ADR 与 BFF owner contract 的固定引用。
2. 更新 Zod/AG-UI boundary 和 focused contract test。
3. 更新 server adapter 或 browser transport。
4. 更新状态机/UI consumer；删除旧 wire/fallback，而不是双读长期共存。
5. 运行 contract、architecture、lint、typecheck、test、build、E2E/live smoke。
6. 同 commit 更新 CURRENT、ACCEPTANCE 和必要 runbook。
