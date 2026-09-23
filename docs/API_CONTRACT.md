# Kokoro User Web API 契约策略

状态：browser-private 治理基线与 W1C-2 目标契约，2026-09-23；W1C-2A 只读 GET relay 与
W1C-2B-1 sign-in 与 W1C-2B-2 tenant/consent 已发布；本工作树 2C RP-only 是待 Root 验收候选。

## W1C-2：同源 IAM 与 Product Session 契约（2A/2B-1/2B-2 已发布，2C RP-only 候选）

### 版本、来源和可见性

当前 Web main 基线 `14e23e602a5631009584d84f58871e51d32b821c` 仍有 IAM magic-link/
team-session 直连和旧 sealed session；2A 只读 `/iam`、2B-1 sign-in POST 与 2B-2 的
静态 `/iam/interactions/*` POST 均已发布；Auth.js Code+S256 与完整 Web→BFF→IAM 仍是目标。
BFF relay 固定policy来源 `a4dbc3339448c7ee8763b0f82d1c0ae4c213bf87`，其
`contract/iam-relay-policy.json` version `1.0.0` 当前 blob SHA-256 是
`ba1e63083b4b2ed0f3eb42308e632bc502cb4f07fcb99a2ea04586f7faa123ad`，
引用 IAM owner `6bc9b190c359b8109238626ff689ce9839e858b5`、allowlist SHA-256
`f63dacfa8a7bcec3c56efb8ffb762a3f8bd82bb380eff40a1462db1e77d61ead` 与 snapshot SHA-256
`b2eac1919e16fdc30a40bee0f3c4300b641bd8f674214aea7731bf10299559e1`。IAM test-only fixture
已随 BFF repin 发布；W1C-2A 已 vendor **只读** policy snapshot。Web contract test 对 snapshot 原始
字节计算固定 digest，并校验 provenance、只读路由子集、结构不变量与篡改负例；Root 的跨仓门另从固定
BFF commit blob 比对同一字节，Web 仓不把本地副本自比冒充源 commit 证明。真实 Web→BFF→IAM 与
Auth.js 仍待后续验收。Web 不重建/维护 IAM OpenAPI、BFF Product OpenAPI 或 BFF policy 的第二事实源。

`/iam/*` 是 Web 拥有的 `browser-private` **原生 OAuth/OIDC 传输边界**，不是 BFF `/v1`
Product API，也不进入 Developer API。`/api/auth/[...nextauth]` 是本工作树已安装但尚未发布的 Auth.js RP transaction/callback
入口；`/auth/sign-in` 是 Web 表单，`/auth/{select-tenant,consent}` 是 IAM 外层引导，真正表单位于
`/iam/interactions/*`。普通 `/api/*` 是 Web 的 browser-private
Product projection，最终请求 BFF `/v1/*`；IAM 所有 endpoint 语义、字段、OAuth 错误和 cookie 仍由 IAM
发布的协议定义，Web/BFF 不包装成 `{data}`/`{error}`。Web 本地准入拒绝可以使用安全机器码和
`x-request-id`，不得泄露 token/secret/原始 provider body。

W1C-2C 第一切片的**当前候选契约**：RP callback 即使完成 code、ID token 与 userinfo 验证，也只返回受控
`503 product_session_unavailable` 并清除 RP 事务；不签发可用 Auth.js/Product Session cookie，
不透出 token、userinfo 或 callback code。这不是首次登录完成。server-only Basic token POST 与
Bearer userinfo GET 只能经固定 BFF `/iam` relay；浏览器直打仍本地拒绝。Product Session、refresh、
logout、普通 `/v1` Bearer 代理及旧路径删除另片完成。
Browser-private RP 入口只接受单 provider 的 Auth.js CSRF 获取、受控 signin POST 与固定 callback GET；
精确同源 Host/Origin、方法、body/query 长度及重复键先校验，浏览器不能覆盖固定 `client_id`、
`redirect_uri`、`scope`、`resource`、`callbackUrl`。authorize 与 token 各恰好一个固定 internal
resource；token 使用 `client_secret_basic`，userinfo 使用 server-only Bearer 且不发送浏览器 cookie。
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
在已发布的 2B-2 基线上，`/api/auth/callback/kokoro-iam` 尚未安装，匹配该目标返回受控 `503 rp_callback_unavailable`；
本 2C 工作树已安装固定 callback，仅将严格同源、唯一 code/state 的 Location 交给浏览器，后续 RP
验证成功仍只报 `503 product_session_unavailable`，不把 token 或可用 session 发给浏览器。这不是完成的登录契约。

上表是 W1C-2B 的完整固定 policy。已发布的 W1C-2A `/iam/[...path]` Route Handler 只安装 GET
`/.well-known/openid-configuration`、`/.well-known/oauth-authorization-server`、`/jwks`、
`/oauth2/authorize`、`/get-session`、`/organization/list`；直接 owner POST、userinfo Bearer、end-session 和
其他动态路由都在 Web 本地 fail closed。本片静态 `/iam/interactions/*` 是 Web 自有表单而非 BFF
catch-all 例外；callback/post-logout 传输在 2B-2 尚未安装。2C 只在 RP callback 真正安装并通过
严格 Location/签名交互与 code 测试后，将 consent 的固定 callback Location 交给浏览器；
post-logout 仍关闭，callback 验证成功只报 `product_session_unavailable`。

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
Content-Security-Policy/X-Content-Type-Options/Pragma 和精确 Set-Cookie，不自动跟随 redirect。W1C-2A
Location 只允许固定 `KOKORO_WEB_ORIGIN` 下已安装的只读 `/iam` route，或固定的
`/auth/{sign-in,select-tenant,consent}` 目标路径；后两者现在先经无状态同源 302 到静态
`/iam/interactions/*`，浏览器才会携带 IAM `Path=/iam` issuer cookie。callback 与 post-logout
Location 在已发布 2B-2 基线尚未允许；本 2C 工作树仅允许安装后的固定 callback URI/唯一 code+state。
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
（authorize、sign-out、end-session/confirm）须
有等价 Web 表单证据，或经真实 wire 证明 IAM 原生 CSRF 生成/携带/校验，再叠加 Web Origin；否则拒绝。
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

Product Session 是 Web server-only：Auth.js 加密 HttpOnly cookie 不经公开 session callback 输出
access/refresh token；Redis `active(g) → refreshing(g,reservation) → active(g+1)` 双阶段 CAS 与 logout
tombstone 先于授权：预留者独占 IAM refresh，成功且 reservation 匹配才 finalize/设新 cookie；pending
期间旧 g 不可代理，失败/超时/结果未知或 finalize 失败使 handle 失效，不回到旧 active。旧 generation、replay、
Redis unavailable 一律 401/明确失败，不回退旧 sealed cookie。普通受保护 BFF `/v1` 代理只注入从当前
Product Session 读取的**一个** `Authorization: Bearer` 与 Web service identity；不再发送
`x-kokoro-namespace`/`x-kokoro-principal-id`，也不相信 body/query/header 中的 tenant/actor。
logout 先在请求内读取 server-only token、tombstone 本地 session，单次有界尝试 IAM revoke/end-session
并清 cookie；远端失败无持久补偿队列，本轮只靠 IAM owner TTL 兜底，并向 UI 区分本地退出与远端未确认。
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
