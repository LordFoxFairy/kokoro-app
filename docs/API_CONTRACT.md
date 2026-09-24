# Kokoro User Web API 契约策略

公开页面路径：`GET /` 是固定单租户营销首页，`GET /login` 是不依赖 System runtime manifest 的服务端 Product RP OIDC 启动路由（成功 302 到同源 IAM authorize，不渲染中转页）；`/app` 要求在线 Product Session；System runtime manifest 是可选展示数据，不决定访问权或 live/preview transport。`/auth/sign-in` 是 IAM issuer 签名交互路由，只有有效签名交互才呈现真正邮箱/密码表单，不能当作静态营销别名。公开首页/登录入口不调用 `/api/system/runtime-manifest`；`/login` 在服务端经 Auth.js CSRF 启动固定 OIDC provider，失败返回无自动循环的 503；此入口行为不改变 token、cookie 或 BFF/IAM owner API。

状态：browser-private 治理基线与 W1C-2 当前/目标契约，2026-09-23；W1C-2A 只读 GET relay、
W1C-2B-1 sign-in、W1C-2B-2 tenant/consent、2C RP-only 与 S1 Product Session 已发布，S1 真实三仓 HTTPS 组合已通过。
普通 `/v1` Bearer adapter 与 UI Product 登录/探针/退出已由 S2-A 切换；S2-A 真实三仓组合已验；旧 route/Team 路径删除未完成。

## R2e-IAM-VERIFY-WEB：邮箱验证 browser-private 增量（本提交已实现，真 IAM 待验）

起始 Web `main` 基线 `0a093f65bdc4990b956b10ae534198e3b4b5c3b5` 消费 BFF policy `1.0.0`、
`eb1eb2926d08b8a3779898b2c31e604a8585ec8b`，artifact SHA-256
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；其浏览器 GET
白名单缺 `/iam/verify-email`。BFF owner `main` `7a7f3adfaec7d1bcee3b2079304a6129c0591d06`
当前发布 `contract/iam-relay-policy.json` version `1.1.0`、SHA-256
`731735ba8ce07c578fe04fa51783a95c7ac7daf50df33cea0ef9cefedc32d032`；Web 本次只读重钉
该 blob 与 commit，不编辑 BFF policy，不建立第二份可编辑 IAM contract。IAM owner
`093b76513a9aa71611c65d4f210e279d3227e002` 拥有 Better Auth 1.7.3 验证 token/邮箱状态，
Web 不解释 token 或验证结果。此增量是 Web `browser-private`，不进入 BFF public `/v1` OpenAPI。

| Web 已实现 operation | 请求与原生响应 |
| --- | --- |
| `GET /iam/verify-email?token=...&callbackURL=...` | 仅此精确路径与 GET；Next 规范化后恰好一个非空 `token`、最多一个 `callbackURL`，重复或额外键在 Web 本地拒绝，零 BFF socket。纯函数拒绝其输入中的编码键名；真实 Next 可将 `%74oken` 规范化成相同 `token`，唯一键可接受，与字面键并存则按重复拒绝。Web 只保证支持形状的键值语义，BFF 保持收到的 Web URL query。`token` 为 IAM 有期签名 JWT；`callbackURL` 不是 Web/BFF 对上游或 `Location` 的授权，Web 不解释/记录 token。错误方法、路径编码 alias、畸形/超限 query 不形成 BFF socket。 |
| IAM 原生 200/302/失败 | 原生 status/body 与已允许 header/cookie 保持；302 `Location` 必须通过现有固定 Web origin、精确已批准路径检查，`/auth/sign-in` 是邮件 bootstrap 指定的返回路径，外域/任意新路径拒绝，不自动跟随。此精确路径的浏览器响应（含 Web 本地拒绝/上游失败）无论上游缺失或给出可缓存 `Cache-Control`，Web 固定覆盖为 `no-store` 并合成 `Referrer-Policy: no-referrer`；其他 GET 不变。 |

BFF policy 的 `responseHeaders` 仍不含 `referrer-policy`；BFF 对此敏感 GET 虽已合成
`Cache-Control: no-store`/`Referrer-Policy: no-referrer`，Web 不能依赖普通 header 白名单透传后者，
也不应为它泛化白名单；Web Route Handler 在已准入路径合成，最终 `src/proxy.ts` 在通用安全头后
对精确 pathname 再覆盖，保证 Next 最终浏览器响应而非仅 helper 对象满足契约。浏览器入站
`Authorization`、Product Session/Auth.js cookie、任意身份 header
不能作为 IAM 凭据；仅已有 issuer cookie 过滤继续有效。Web 自有拒绝维持受控 code、`x-request-id`、
`no-store`/`no-referrer`，不泄露 query、token、原生错误 body。该 GET 不生成 Product Session、Web Redis key、SQL、
receipt 或缓存，不增加 POST、sign-up、组织写入和通配 `/iam/*`。验证先以固定 artifact digest/provenance
及 contract/architecture 测试拒绝来源漂移，再用 unit/真实 Next HTTP 覆盖支持的 query 形状、同源 302、
缺失/恶意缓存头、外域/编码/错方法零上游；真实 IAM 邮件点击及浏览器 Referer 由 Root 组合门另验。
Next 开发模式的 `logging.incomingRequests.ignore` 仅精确抑制 `/iam/verify-email`（含 query）的
框架 stdout 请求行；不改变其他路由日志，也不是 TLS 前置 access log、浏览器历史或邮件系统的保密声明。

## W1C-2：同源 IAM 与 Product Session 契约（S1 已发布并完成三仓组合）

### 版本、来源和可见性

当前 Web 仍有 IAM magic-link/team-session 直连和旧 sealed session；2A 只读 `/iam`、2B-1 sign-in POST、2B-2 静态 `/iam/interactions/*` POST、2C Auth.js Code+S256 RP-only 与 S1 均已发布。S1 成功 callback 后建立在线 Product Session，提供标准 `GET/POST /api/auth/session` 与 `POST /api/auth/signout`；session GET 仅返回 authenticated/subject/expiry，不回 access/refresh，POST 要求同源 Origin 与 Auth.js CSRF。普通 BFF `/v1` adapter 已在线核验 Product Session generation 并仅发送一个 access Bearer；S2-A 的真实三仓业务代理链仍待验收。
BFF relay 在 W1C-2 起始基线固定来源 `eb1eb2926d08b8a3779898b2c31e604a8585ec8b`，其
`contract/iam-relay-policy.json` version `1.0.0` 当时 blob SHA-256 是
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`，
引用 IAM owner `e36da9ecf8d62a364182949817431a8e2329d50a`、allowlist SHA-256
`f63dacfa8a7bcec3c56efb8ffb762a3f8bd82bb380eff40a1462db1e77d61ead` 与 snapshot SHA-256
`b2eac1919e16fdc30a40bee0f3c4300b641bd8f674214aea7731bf10299559e1`。IAM test-only fixture
已随 BFF repin 发布；W1C-2A 已 vendor **只读** policy snapshot。Web contract test 对 snapshot 原始
字节计算固定 digest，并校验 provenance、只读路由子集、结构不变量与篡改负例；Root 的跨仓门另从固定
BFF commit blob 比对同一字节，Web 仓不把本地副本自比冒充源 commit 证明。真实 Web→BFF→IAM 与
Auth.js S1 真实 IAM 组合已通过；S2-A 普通业务代理的真实组合待验。Web 不重建/维护 IAM OpenAPI、BFF Product OpenAPI 或 BFF policy 的第二事实源。

`/iam/*` 是 Web 拥有的 `browser-private` **原生 OAuth/OIDC 传输边界**，不是 BFF `/v1`
Product API，也不进入 Developer API。`/api/auth/[...nextauth]` 是已发布的 Auth.js RP transaction/callback 与 S1 session/signout
入口；`/auth/sign-in` 是 Web 表单，`/auth/{select-tenant,consent}` 是 IAM 外层引导，真正表单位于
`/iam/interactions/*`。普通 `/api/*` 是 Web 的 browser-private
Product projection，最终请求 BFF `/v1/*`；IAM 所有 endpoint 语义、字段、OAuth 错误和 cookie 仍由 IAM
发布的协议定义，Web/BFF 不包装成 `{data}`/`{error}`。Web 本地准入拒绝可以使用安全机器码和
`x-request-id`，不得泄露 token/secret/原始 provider body。

W1C-2C 第一切片的**历史 RP-only 契约**：当时 RP callback 即使完成 code、ID token 与 userinfo 验证，也只返回受控
`503 product_session_unavailable` 并清除 RP 事务；不签发可用 Auth.js/Product Session cookie，
不透出 token、userinfo 或 callback code。这不是首次登录完成。server-only Basic token POST 与
Bearer userinfo GET 只能经固定 BFF `/iam` relay；浏览器直打仍本地拒绝。S1 已替代成功 callback 的固定 503，建立 Product Session 并实现 refresh/signout；普通 `/v1` Bearer 代理已由 S2-A 完成；旧路径删除仍属 S2-B。
Browser-private RP 入口只接受单 provider 的 Auth.js CSRF 获取、受控 signin POST 与固定 callback GET；
精确同源 Host/Origin、方法、body/query 长度及重复键先校验，浏览器不能覆盖固定 `client_id`、
`redirect_uri`、`scope`、`resource`、`callbackUrl`。authorize 与 token 各恰好一个固定 internal
resource；token 使用 `client_secret_basic`，userinfo 使用 server-only Bearer 且不发送浏览器 cookie。
W1C-Team-R3-Web 的固定申请 scope 为
`openid profile email offline_access iam:session-authorization.verify iam:member.read iam:invitation.read iam:role.read`；
保留原顺序后追加三个 Team 只读 scope，不添加写权限。Auth.js authorization Location 的 scope 必须
完整、顺序一致且仅出现一次；缺项、重复或添加写权限均拒绝。这是 Web 申请边界，不替代 IAM/BFF 的授权验证。
state/nonce/PKCE 与 ID token issuer/audience/signature 在 code exchange 前后分别验证，userinfo
`sub` 必须等于已验证 ID token 的 `sub`；Redis state 原子一次消费，错误/失联只返回安全码。
ID token 算法固定 `EdDSA`（Ed25519），RS256 即使有合法 JWK 也拒绝。BFF token/userinfo/JWKS
backchannel 各有绝对 5 秒及响应头/正文 1 MiB 上限，超限/慢滴流关闭连接；不放宽 BFF 固定 policy。
浏览器 callback 断连时 Web 将 `request.signal` 传播到当前 BFF 请求并销毁 socket，不继续 JWKS/userinfo。

### `/iam` 固定 route/method 与 HTTP 语义

仅消费最终固定 BFF policy 的如下**精确** route/method；路径前缀是 Web/BFF 的 `/iam`，表内是
policy 的 relative path，不扩张为任意 catch-all：

| Relative path | Methods | 用途与入站凭据 |
| --- | --- | --- |
| `/.well-known/openid-configuration`、`/.well-known/oauth-authorization-server`、`/jwks` | GET | issuer discovery/JWKS；无浏览器 Authorization |
| `/oauth2/authorize` | GET、POST | Code+S256；issuer cookie；POST 同源 CSRF |
| `/oauth2/token` | POST | 仅 Web server 生成 Basic，code/refresh 与单一 resource；无浏览器 cookie |
| `/oauth2/userinfo` | GET | 仅 Web server 生成 Bearer；无浏览器 cookie |
| `/oauth2/revoke` | POST | 仅 Web server 生成 Basic；无浏览器 cookie |
| `/oauth2/end-session` | GET、POST | issuer cookie；POST 同源 CSRF |
| `/oauth2/end-session/confirm` | POST | issuer logout-confirmation cookie；同源 CSRF |
| `/sign-in/email`、`/sign-out` | POST | issuer cookie；同源 CSRF |
| `/get-session`、`/organization/list` | GET | issuer cookie；仅 IAM 交互状态，不是 Product Session 授权 |
| `/organization/set-active`、`/oauth2/consent`、`/oauth2/continue` | POST | issuer cookie；同源 CSRF |

W1C-2B-2 的 `/auth/select-tenant|consent` 只准严格同源 GET 且保持原签名 query，302 引导到
Web-owned 静态 `/iam/interactions/select-tenant|consent`；外层 POST 405。issuer cookie 的 IAM
原生 `Path=/iam` 在内层才被浏览器携带；CSRF cookie 与 POST form 也只绑定内层路径。
四条交互 route 显式拒绝 HEAD/OPTIONS 为 405，不生成 CSRF cookie/Redis nonce，不触达 BFF；
真实入站 method 还在共用 guard 与 handler 预期 method 精确比较，不能借框架派发复用 GET/POST。
内层 select-tenant GET 只把受信 BFF `/iam/organization/list` 的 active
组织作为候选，POST 绑定候选集并重核，调用固定 `/iam/organization/set-active`；内层 consent GET
仅展示未验签的 signed-query `scope` 预览，POST 无浏览器 `scope` 字段，仅明确 Agree 后将 query
原样交 IAM `/iam/oauth2/consent`，签名与 scope 子集由 IAM 验证。两页的 200 redirect JSON/302
仅转成白名单交互 Location 与合规 issuer cookie；401/429/5xx body/cookie 不透出。最终 callback
在 2B-2 基线上，`/api/auth/callback/kokoro-iam` 尚未安装，匹配该目标返回受控 `503 rp_callback_unavailable`；
当前已安装固定 callback；按 IAM 实际成功响应仅将严格同源、唯一 `code/state/iss`
且 `iss=${KOKORO_WEB_ORIGIN}/iam` 的 Location 交给浏览器，完整 query 由 RP 验证型 callback 再核 issuer。后续 RP
2C RP-only 基线验证成功仍只报 `503 product_session_unavailable`；当前 S1 验证成功建立 Product Session、清 RP 事务 cookie 并 303 到 `/app`，仍不把 token 发给浏览器。S1 真实三仓链已验；S2-A 普通业务代理组合已通过固定三仓真 HTTPS。

上表是 W1C-2B 的完整固定 policy。已发布的 W1C-2A `/iam/[...path]` Route Handler 只安装 GET
`/.well-known/openid-configuration`、`/.well-known/oauth-authorization-server`、`/jwks`、
`/oauth2/authorize`、`/get-session`、`/organization/list`；S1 另安装固定 `client_id`/`post_logout_redirect_uri` 的 `/oauth2/end-session` GET，以及只接收 `action=confirm`、精确同源 Origin、IAM 签名 confirmation cookie 的 `/oauth2/end-session/confirm` POST。直接 owner POST、浏览器 userinfo Bearer 和其他动态路由仍在 Web 本地 fail closed。本片静态 `/iam/interactions/*` 是 Web 自有表单而非 BFF
catch-all 例外；callback/post-logout 传输在 2B-2 尚未安装。2C 只在 RP callback 真正安装并通过
严格 Location/签名交互与 code 测试后，将 consent 的固定 callback Location 交给浏览器；
S1 已安装受限 post-logout 确认流程，callback 验证成功建立 Web Product Session；其余动态路由仍关闭。

W1C-2A 拒绝 magic-link alias、任意 `/internal/v1`/admin/dynamic-client CRUD、未知方法，以及 handler
可见的大小写/encoded route alias；本地拒绝不得开启 BFF/IAM socket。真实 Next HTTP 探针证明 dot 与
encoded-dot 输入在 handler 前规范化为同一 canonical resource，双斜线由 Next 返回 308 canonical
Location，编码 route 名返回 404；这些框架行为不扩张 Web allowlist、身份或泄露响应。上游 Location
仍在 URL 解析前拒绝 `%`、dot segment、双斜线与 backslash。Web 固定 BFF origin、service identity
和受控 header/body；丢弃入站 browser Basic/Bearer、Forwarded、`x-kokoro-*` 自报身份，
不将 Auth.js/Product Session cookie 发给 BFF/IAM。仅 issuer snapshot 中的完整 cookie 名允许通过：
`kokoro-issuer.{session_token,session_data,dont_remember,session_token.oauth_logout_confirmation}`，
production 使用 `__Secure-kokoro-issuer.` 前缀。普通 cookie `Path=/iam`；logout-confirmation cookie
仅 `Path=/iam/oauth2/end-session/confirm`。多 `Set-Cookie` 不能合并；未知名称、Domain、路径或属性拒绝。

代理保持 IAM 原生 status/body、合法 Location、Cache-Control、Content-Type、429 Retry-After、logout
Content-Security-Policy/X-Content-Type-Options/Pragma 和精确 Set-Cookie，不自动跟随 redirect。
唯一浏览器导航适配是 `GET /iam/oauth2/authorize` 的 IAM 200 `application/json` 精确
`{redirect:true,url}`：先经原生响应 header/issuer cookie 校验，再按已存在的固定同源交互/严格 callback
Location 白名单验证 `url`，转无 body 302；其他 `/iam` JSON、非法 shape/URL、错误 status 不作重定向，
非法 authorize continuation 返回无上游 body/cookie 的 502。该适配不新增 BFF/IAM contract 或可编辑 policy。
固定 policy 的 Location 只允许固定 `KOKORO_WEB_ORIGIN` 下已安装的只读 `/iam` route，或固定的
`/auth/{sign-in,select-tenant,consent}` 目标路径；后两者现在先经无状态同源 302 到静态
`/iam/interactions/*`，浏览器才会携带 IAM `Path=/iam` issuer cookie。callback 与 post-logout
Location 在 2B-2 基线尚未允许；当前仅允许安装后的固定 callback URI/唯一
`code/state/iss`，其中 `iss` 精确等于固定 Web issuer；缺失、重复、错误或额外键拒绝。
合法 IAM 已签 query 只作为 opaque continuation 保留，
不当作 Web 自报授权。不可信 Location/Set-Cookie 必须在输出前拒绝。policy 最大
query 8192 B、request body 65536 B、header 16384 B、response 1048576 B、duration 5000 ms；
Web 限额不得高于这些值，并传递取消。`KOKORO_WEB_ORIGIN` 是 server-only 固定 HTTP(S) origin，缺失或
非精确 origin 时 relay 503；入站 Host 必须精确等于配置 host，GET 若有 Origin 必须等于配置 origin，
POST 必须携精确 Origin，否则在连 BFF 前 403。反代后的 Next handler URL authority 可为内部
`localhost:<port>`，不作为公开 origin 判据；不采信 `Forwarded`/`X-Forwarded-*` 作为替代身份。
W1C-2A 的 GET 必须无 body：非零/异常 `Content-Length`、任意 `Transfer-Encoding` 或 Fetch Request 可观察
body 均在连 BFF 前返回 400；真实 Next HTTP 测试覆盖无 Content-Length 的 chunked GET body。
所有浏览器 cookie mutation
缺失/`null`/错误 Origin 或 CSRF 证据都拒绝。Web-rendered `/auth/sign-in` 以及静态
`/iam/interactions/{select-tenant,consent}` GET
为目标 POST path、IAM 交互和短 TTL 生成随机 CSRF 值，分别放入 Web HttpOnly cookie 和隐藏 form 字段；
其摘要/绑定存 Web Redis 短 TTL key，POST 时原子一次性消费，Redis unavailable 拒绝；
浏览器表单 POST Web-owned Server Action/Route Handler 时，Web 在连 BFF 前验证 Origin、双值、
交互绑定与一次性消费，按 IAM 机器契约构造 `/iam/sign-in/email|organization/set-active|
oauth2/consent|oauth2/continue` 原生 body，Web CSRF 字段不传 IAM；IAM 已签 query 与 issuer cookie
原样续接。浏览器直 POST 上述 `/iam` 路由无 action 证明则拒绝。其余允许的浏览器 `/iam` POST
（authorize、sign-out）须
有等价 Web 表单证据，或经真实 wire 证明 IAM 原生 CSRF 生成/携带/校验，再叠加 Web Origin；否则拒绝。
`end-session/confirm` 已单独核对 Better Auth 1.7.3 原生 signed confirmation cookie、session/TTL 绑定；Web 再限制精确 Origin/Host、固定 form 与 cookie 路径，不作为通用 POST 例外。
Auth.js 自身 action 的 CSRF token 与同源 Origin 叠加校验；普通业务 cookie mutation 使用 Web 自有
CSRF 防护。server-only token/revoke 路径的 Basic 只来自 Web 受信代码；
BFF 验 Web service 身份但不假设同一 secret 能判断 Basic 最初是否来自浏览器。

### RP、Product Session 与普通 `/v1`

Auth.js RP 配 Code+S256 PKCE、state、nonce；IAM client 由 operator 创建/readback，必须是
`user_delegated`/`client_secret_basic`、`require_pkce=true`、`enable_end_session=true`、精确 callback/
post-logout URI、`openid profile email offline_access iam:session-authorization.verify` scopes、
internal resource binding。`IAM_ISSUER_URL` 与 discovery issuer 精确相同。authorize/token/refresh wire
均须恰好一个 `resource=https://kokoro.dev/resources/iam-internal`；浏览器参数不能覆盖它。Auth.js v4
默认 token request 不视为已覆盖，此点须在真实 HTTP 检查请求体/Bearer audience/BFF admission。

Product Session 是 Web server-only：Auth.js 加密 HttpOnly cookie 只含随机 session ID、generation、
当前 access 与必要 RP 退出提示，**不含 refresh**；固定 `KOKORO_WEB_ORIGIN` 为 HTTPS **或** Web 运行于 production mode 时，Product cookie 创建/refresh/清除均带 `Secure`，不借 IAM issuer 的 production cookie 模式决定；公开 session callback 不输出 token。Web Redis 隔离
record 保留 Web 密钥加密的当前 refresh、固定到期及 `active(g)`/`refreshing(g,reservation,deadline)`/
`revoked`。每请求先在线比对 generation/tombstone。refresh 的第一 CAS 只允许一位赢家从 active 预留，
由赢家向 IAM 发起至多一次固定 Basic/resource exchange；第二 CAS 仅在 reservation、deadline、未撤销
仍成立时提交新加密 refresh 与 `active(g+1)`，随后才发新 cookie。败者只拒绝本请求，不撤销赢家、
不清其 cookie、不请求 IAM；pending、旧 generation、replay、结果未知、Redis unavailable 均明确拒绝；reserve 后密文 AAD 解密损坏尽力按 reservation tombstone，Redis 故障仍 fail closed；
不回退旧 active/sealed cookie，也不依赖 issuer replay 窗口。未决 reservation 到期仅撤销。refresh wire 对 access UTF-8 ≤2048 B、refresh ≤8192 B、整数 `expires_in` 1–3600 s 校验；Product JWE Set-Cookie 完整字节 ≤4096 B，callback 在 Redis 创建前、refresh 在 finalize 前预检，超限不推进 generation。Product 成功 GET/refresh/signout 带随机 UUID `x-request-id`。finalize
成功但新 cookie 交付未知，或 finalize ACK 未知时不发送新 cookie；即使 Redis 已提交新 generation，
旧 g 仍拒绝，须重新登录，无客户端可达的 active record 由 TTL 回收。普通受保护 BFF `/v1` 代理只注入从当前
Product Session 读取的**一个** `Authorization: Bearer` 与 Web service identity；不再发送
`x-kokoro-namespace`/`x-kokoro-principal-id`，也不相信 body/query/header 中的 tenant/actor。
logout 以可信解封的 session ID 与 cookie generation 原子 compare-and-tombstone；若当前 record generation 不匹配，旧 cookie 调用不发送 Product `Set-Cookie`（否则乱序响应可能删除新 cookie），HTTP 200 返回精确 `{ "status": "stale_session", "remote_revocation": "not_required" }`，旧 cookie 仍被在线 generation 校验拒绝；不写 tombstone、不删除当前 record、不请求 revoke，也不返回 `issuer_session`/`issuer_end_session_url`。**仅匹配 generation 的 active 记录**
同时 take 已确认当前的加密 refresh，并单次有界尝试 IAM revoke；issuer end-session 是单独的浏览器确认流程，不由 refresh revoke 代替。refreshing/pending 记录
只 tombstone，绝不 take/发送可能已轮换的旧 refresh；报告远端撤销未确认。记录缺失也建覆盖最大会话/
在途窗口的 tombstone，迟到 finalize 不可复活；重复 logout 不重复远端 revoke。清 cookie；active
状态的远端失败报告未确认，写入 ACK 未知则清 cookie 只能报告本浏览器清除，不能报告服务端撤销。
不把旧 refresh 的 revoke 当作幂等或单设备操作；其可能影响同 client/user family 且返回 400。
无持久补偿队列，远端未确认仅靠 IAM owner TTL 兜底。 `POST /api/auth/signout` 返回 `issuer_session=pending_browser_confirmation` 与固定同源 `issuer_end_session_url`，URL 仅含注册的 `client_id` 和 `post_logout_redirect_uri`，无 ID/access/refresh token；该响应不表示 IAM issuer 已退出。浏览器 GET 确认页取得 IAM 签名、限定 `Path=/iam/oauth2/end-session/confirm` 的 confirmation cookie，随后以精确 Origin 和 `action=confirm` POST 专用路由，IAM 验签及 TTL/session 绑定后清除 issuer session 并重定向 `/auth/sign-in`。confirmation cookie 不透传其他 GET/POST；错误 Origin、额外参数、错误 form 或非法重定向在 Web 拒绝。确认表单限 1024 B、应用读取 5 秒硬截止；Next 在 body 未到齐前的缓冲不算 handler 已响应。
service-only runtime manifest 与公开 Share 按 BFF owner 明确边界运行，不伪造用户凭据。BFF 自己验证
IAM admission、resource/tenant 业务授权；Web session UI 不构成 owner 授权。

旧 `/api/auth/magic-link/request`、`/api/auth/callback`、`/api/auth/logout`、`/api/auth/session-state`、
旧 `/api/team/*` magic-link/team-session、`/auth/refresh`、旧 sealed-envelope/nonce 与 IAM 直连
在后续 Product Session/clean-slate cutover 切片删除或按上述 route 替换，不留 alias、fallback 或双轨 cookie；
2C RP 验证片不删除这些仍被旧调用点使用的路径，也不将其视为新 RP 授权。既有 Product request/
response、幂等 key、SSE/AG-UI 仍服从 BFF `/v1` owner contract；`/iam` 原生协议不套用 Product
JSON envelope、Product idempotency receipt 或分页。

### 验收矩阵

W1C-2A 的 `pnpm contract` 检查 snapshot 固定 digest/provenance/invariants/tamper，route/server 测试检查
只读路由正反例、cookie/header/redirect、固定 public origin、限额/timeout/cancel；真实 Next HTTP 测试记录
canonical、evil Host、dot/encoded-dot canonicalization、双斜线 308 和编码 route 404。Root 跨仓门负责
固定 BFF commit blob 的源字节比对。W1C-2B 再补 Origin/CSRF、普通 `/v1` 单一 Bearer 与零自报身份；
`pnpm lint`、`pnpm typecheck`、
`pnpm test`、`pnpm build`、`pnpm test:e2e` 覆盖实现及浏览器状态。Root 隔离真实 Web→BFF→IAM
HTTP/Browser 证明首次 sign-in、tenant/consent signed query、callback code 单次使用、refresh rotation
并发、logout/revoke、跨 tenant/同 tenant 其他用户 404/403、IAM/Redis 失联、429、安全 header、
无 credential 泄漏。IAM fixture/BFF repin 虽已发布，Web consumer 与真实组合仍为**待验**；登录边界完成
不等于 W1D Product generated consumer/AG-UI edge 完成。

## 1. Visibility 与发布边界

本仓所有浏览器同源 `/api/*` 都是 `browser-private`。它们由 `kokoro` 拥有，只用于当前 Web 与
同一部署中的 server adapter 协同升级，不承诺第三方兼容性，也不进入 Developer API 门户。

只有 `kokoro-bff` 自有、标记为 `public` 的 Product API 可以进入 Developer API。Web 文档可以链接
固定 BFF artifact，但不得复制一份可编辑 OpenAPI、发布内部 route，或把 browser-private DTO 宣称为
公开 API。

## 2. 调用拓扑

```text
Browser /api/*                         browser-private
  -> Web same-origin adapter
  -> kokoro-bff /v1/*                  BFF-owned Product API
  -> owner APIs / Agent / Scheduler    internal-owner or event-protocol
```

终态不允许 Web 直连 IAM/System/Agent/其他 owner。当前认证 helper 仍直连 IAM，是已登记迁移缺口，
不是新的允许例外。

## 3. 当前契约来源

| 来源 | 用途 | 权威性 |
| --- | --- | --- |
| `src/app/api/**/route.ts` | 实际注册路径、method、header 与 projection | 当前运行事实 |
| `src/contract/*.ts` | Zod request/response、path helper、AG-UI narrowing | 当前 runtime contract source |
| `contract/api-contract.test.ts`、`tests/contract/` | 正向、拒绝、路径和 event 回归 | 可执行约束 |
| `docs/integration/*.md` | 细节与历史上下文 | 次级参考；可能滞后 |
| `src/generated/proto/*` | 旧 Root source 生成的 consumer snapshot | 冻结历史；当前不可再生、未被 runtime import |

本仓没有活跃的 `contract/openapi/` 或 generator。不得手改 `src/generated/proto/` 使其看似当前；若
重新引入生成流程，source、生成器、固定工具版本、digest、breaking check 和 CI 必须一起落在正确 owner。

## 4. Browser-private route 分类

| 浏览器路径 | 当前用途 | 目标上游 |
| --- | --- | --- |
| `/api/session/*` | Chat snapshot、command、control、AG-UI SSE、artifact/share | `kokoro-bff /v1/*` |
| `/api/hub/*` | Skills、MCP、Projects 的历史 browser alias | `kokoro-bff /v1/{skills,mcp,projects}/*` |
| `/api/agents/*` | Agent connection setup 投影 | `kokoro-bff /v1/agents/*` |
| `/api/scheduled-tasks/*` | Scheduled typed adapter | `kokoro-bff /v1/scheduled-tasks/*` |
| `/api/billing/*` | Billing catalog/checkout 投影 | `kokoro-bff /v1/billing/*` |
| `/api/system/runtime-manifest` | 当前产品/surface 的 manifest | `kokoro-bff /v1/system/runtime-manifest` |
| `/api/shared/*` | 公开 share 投影 | `kokoro-bff` owner route |
| `/api/auth/magic-link/request`、旧 `/api/auth/callback`、旧 `/api/auth/logout`、`/api/auth/session-state` | 当前 magic-link、sealed session 登录/退出/状态 | W1C-2 删除，不保留 alias；Auth.js 专用 `/api/auth/[...nextauth]` 接管 RP action/callback；Product Session 展示状态按新 browser-private contract 单独定义 |
| `/api/team/*` | 当前 team context/switch 与旧 IAM team-session 路径 | 旧 team-session、switch/context alias 删除；仍有产品需要的 tenant 选择由 `/auth/select-tenant` + `/iam/organization/*` IAM 原生交互承担，不复制 team-session |
| `/iam/*`、`/auth/{sign-in,select-tenant,consent}` | `/iam` owner mutation 直接 browser POST 全拒绝；`/auth/sign-in` 是 GET/POST，另两个 `/auth/*` 仅 GET 引导；静态 `/iam/interactions/*` 是带 issuer cookie 的 Web-owned GET/POST，consent 最终 RP callback 仍受控 503 | 后续 Auth.js RP 安装固定 callback 并验收；不是任意 `/v1` proxy |
| `/api/dev/*` | 非 production preview fixture | 无 live upstream；不得在 production 启用 |

Catch-all route 不表示浏览器可以任意代理 `/v1`；允许路径必须由 client/schema/route test 明确冻结。

## 5. JSON 与 HTTP 规则

### 5.1 通用形状

BFF 成功（示意；request ID 位于响应 header）：

```json
{"data": {}}
```

BFF/Web 错误（示意）：

```json
{"error": {"code": "stable_code", "message": "safe message", "retryable": false}}
```

Web 可在 browser-private 边界将 BFF success `data` 投影成当前 UI 所需 DTO，但错误必须保留稳定 code
与响应 `x-request-id`。当前部分 route 仍返回 flat `{error: string}` 或 body `meta.request_id`，
列为收敛缺口，不能作为新 route 模板。

### 5.2 输入与命名

- 浏览器 JSON 使用 `snake_case`；外部值先以 `unknown` 接收并经 Zod 校验。
- tenant、subject、service identity、部署域名和 request id 不从 body 推导。
- opaque ID 在 path segment 中只编码一次；分页使用 opaque cursor 和稳定排序。
- 长期公开 offset pagination 不由 Web 定义。

### 5.3 幂等与并发

- POST/PATCH/DELETE 等具副作用 command 使用 `Idempotency-Key`；相同 key/相同 digest 重放原结果，
  相同 key/不同 digest 返回冲突。
- 浏览器可产生 command identity，但 durable receipt 与 request digest 由 BFF owner 保存。
- MessageCreate 的浏览器内部参数可携 `idempotency_key` 供状态机重试；标准 Chat 客户端发送的 JSON 仅为
  `{content, model?, agent?, thinking?, pinned_skills?, mcp_servers?, project_ref?}`，该 key 只在
  `Idempotency-Key` header。客户端在 fetch 前拒绝未知字段或空/缺 key；未获回执的重试冻结
  首发 options/业务 body 与 key。同一 AI SDK UIMessage id/content 的重复提交复用 key，新消息
  id 或编辑后的内容使用新 key。`/api/session/*` 不再从 JSON body 提升旧 key。
- 幂等身份缺失时不做自动 mutation retry。
- 资源版本冲突由 BFF contract 的 version/ETag/receipt 语义表达；Web 不猜测成功。

### 5.4 身份、缓存和错误

- 浏览器只携同源 cookie；Web 不把 cookie 原样转发 BFF。
- mutating request 需要同源防护；server adapter 重建 allowlisted header。
- 用户/工作区 JSON 和 SSE 使用 `private, no-store`；不在公共 CDN 缓存。
- 返回体不得含 SQL、堆栈、provider secret、runtime JWT、refresh token、internal URL 或 tenant selector。
- request ID 位于 `x-request-id`，不为关联信息机械新增 body `meta.request_id`；`Retry-After` 只按 allowlist 透传。

## 6. AG-UI 单协议规则

Web↔BFF 的 Agent event stream 只使用 AG-UI canonical event union：

- 标准 Run、Text、Tool、Reasoning、Activity、Subagent、Interrupt/Resume 事件优先；
- Kokoro 专有 artifact/delivery 只能使用有命名空间、已登记 schema 的 `CUSTOM`；
- BFF durable ledger 的 cursor 是唯一 replay axis；`Last-Event-ID` 回传该 cursor；
- Web 对 AG-UI 校验后映射为内部 `UIMessage` parts 或纯 reducer event；内部表示不回到网络；
- 不允许 legacy `SessionEvent` SSE、双读、protocol fallback 或第二个 resumable stream；
- `AgUiChatTransport` 是仓内 Vercel AI SDK adapter，不是 server endpoint，也不拥有持久化事实。

当前源码已有 AG-UI parser，但仍保留 legacy network parse fallback，且 AI SDK adapter尚未实现。
因此本节是已接受 contract 方向，不是“迁移已完成”的证据。

## 7. 版本与 breaking policy

- browser-private contract 与 Web commit 共同版本化；不单独承诺 public semver。
- BFF upstream 始终使用显式 `/v1`，其 breaking policy 由 `kokoro-bff` owner contract 定义。
- 变更顺序：BFF owner contract/artifact → Web 固定来源/digest → Zod/AG-UI parser → adapter → tests/docs。
- V1 clean-build 不保留双读、旧 endpoint alias 或 runtime fallback；协调发布后删除旧形状。
- generated 输出只读，必须由固定 source/generator 再生并通过 drift/breaking check。

## 8. 最小 contract test

每次变更至少覆盖：

1. 正常 request/response/event；
2. unknown field、缺失字段和边界值拒绝；
3. tenant/identity 字段不能由 browser body/header 注入；
4. idempotency、cursor、`Last-Event-ID` 和 request id；
5. BFF error envelope 与不泄密映射；
6. AG-UI 未知/非法事件 fail-loud；
7. live 失败不回退 preview 或旧协议；
8. browser-private contract 不进入 Developer API catalog。

执行入口：

```bash
pnpm contract
pnpm test:architecture
```
