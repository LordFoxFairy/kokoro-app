## 公开Skill list的唯一原生Bearer入口（2026-10-22，候选）

src/app/v1/skill.list/route.ts只透传固定public GET，复用iam-relay-config的部署Host／Origin与service secret、domain-context的部署Domain、upstream-http的有限传输。它不调用Product Session、不接其他/v1方法或任意URL；原Hub／网站RPC准入保持。单操作generated/bff-public-skill-list由固定canonical正规生成，不手维护第二份schema。正常生效与真实owner链另验。

## 登录交易隔离（2026-10-21，本地候选）

`oidc-transaction-cookies.ts` 只配置每次请求的 Auth.js 原生 proof 名字、安全属性、精确终态清理与可见预算；`product-login-return.ts` 只签发／核验每启动表单的目标 intent。唯一 `oidc-rp-transaction.ts` v2 ledger 验 MAC 和浏览器绑定后 CAS；不兼容旧记录或共享 return cookie。`iam-interaction-csrf.ts` 为 sign-in 每次渲染独立 proof，原始 query 与 proof 共同定位 cookie，验证后 CAS；其他 interaction 保原语义。未知 exchange 不重发，Product session 和全局会话 CSRF 不纳入临时清理。完整设计及未激活状态见 docs/TECHNICAL_DESIGN.md 与 docs/CURRENT.md。

<!-- SET47 archive consumer: 2026-10-15 -->
SET47：archived-tasks.ts仅代理本人归档列表；session-archive.ts仅承接现session catch-all的GETarchive/POSTarchive|restore。固定BFF、server-only bearer、Origin/Host/scheme、严格raw闭集JSON与目标/action、1MiB、一次总10秒含params/body/会话/上游EOF/final六字段复验。POST允许identity/chunked的合法framing，拒冲突与不支持encoding，实际4096B+EOF；不改generic Chat/SSE代理。

## SET43 已移除会话的账户资料读取（2026-10-15；D0，先真实HTTP负控）

测试夹具补充：GET不执行的Auth.js agent factory因server-only导入需空stub；身份准入与requestWithDomain仍是真实HTTP。前两轮仅collection失败，不算行为RED。

runtime_audit唯一产品writer，Root设计/文档/资源/审查/Git/接入。现product-identity只对已配置BFF /v1/me的401、严格error/meta闭集及session_invalid、非空message、本次outbound ID同时绑定x-request-id与meta.request_id、JSON精确media type、no-store且无Location/Set-Cookie，抛具名ProductIdentitySessionRejectedError；16KiB/5s/取消保留，401正文解析后复核signal。标准JSON解析后做结构校验，不宣称raw重复键防护。其余错误及原200验证保持。现account-profile catch先check()，仅此instanceof→401 account_profile_session_required，其余503，零userinfo回退。

product-identity.error.ts只维护内部异常类型；不返回原始BFF错误、token或消息。原callback/refresh仍fail closed，未改其状态策略。

## SET21 分享边界

`shared-tasks.ts` 承接具名 `/api/account/shared-tasks` GET，使用正式 BFF public artifact 的闭合 schema、单 10 秒总预算及 1 MiB 正文限额，核对部署固定租户、受信 subject 和最终同一有效 Product Session。它只调用 BFF，不读取分享数据库或内部 owner 服务。

`session-share.ts` 只承接原 session catch-all 的精确分享 POST/DELETE，保持原 scope、project_ref、Idempotency-Key 和请求正文语义，校验 canonical Origin 与正式 share_id ACK；非分享及 SSE 原路径不变。`lib/shared-tasks-json.ts` 只负责本片 raw JSON 的 UTF-8、重复键和深度边界，`lib/shared-tasks.schema.ts` 由正式生成形状派生运行时校验，不建立另一份可编辑 contract。

## Product Session 生命周期读取（2026-10-19）

productSessionState/inspectSessionState只服务App壳和原生session端点，区分active/refreshing/stale/absent/unconfirmed；原业务activeProductSession仍要求有效access与当前generation。GET/RSC不刷新、不输出凭据，POST保原Origin/CSRF、双CAS和正式身份核验；过期reservation不被新请求抢占。

## Authorize浏览器异常恢复（2026-10-19）

`oidc-login-recovery.ts` 仅将已准入的顶层 HTML 登录失败重定向到固定产品结果页 `/auth/sign-in/failed`，不携回调 query、不自动重试、不更改现有 session；API 和非顶层导航保原错误契约。

# lib/server — Web BFF 服务端边界

## 职责

把 User Web 的认证和上游服务调用留在 Next.js 服务端。浏览器只访问同源 `/api/*`，不接触
runtime token、内部服务地址、workload secret 或后端隔离键。

## 公开 API

- `account-sessions.ts`：两条 `/api/account/sessions` route 的具名 BFF adapter；GET 可选 canonical Origin，DELETE 必需 canonical Origin，并在总预算内证明入站 stream 为 EOF，拒绝实际正文。严格正式生成合同、单 10 秒/1 MiB、主动取消及最终同一有效 Product Session 复核；禁止转发 issuer cookie、自动写重试或把未知结果视为成功。共用 `lib/account-sessions.schema.ts`，生成出处由正式 BFF artifact 唯一提供。

- `same-origin.ts`：六条业务同源 adapter 的变更请求 Origin/Host 守卫；不读取 IAM、cookie、Redis 或 SQL。
- `domain-context.ts`
  - `configuredDomain(env?)`：只读取服务端 `KOKORO_DOMAIN`，trim 并校验 hostname 形状。
  - `forwardedHeaders(domain)`：生成服务端上游 header，不读取 Request 或浏览器状态。
- `bff-response.ts`
  - `requestIdForRequest`、`bffSuccessEnvelopeSchema`、`bffErrorEnvelopeSchema`：统一 BFF
    envelope 和 request id 解析。
  - `webErrorResponse`、`bffErrorResponse`：输出嵌套 `error`/`meta` 错误包络，并将
    `meta.request_id` 映射为公开 `x-request-id` 响应头；仅保留 allowlist 的上游响应头。
- `service-config.ts`
  - `configuredBffBaseUrl(env?)`：读取独立业务 BFF 基址并去除尾斜杠。
  - `bffPathUrl(path, env?)`：生成版本化业务 BFF 地址。
- `upstream-http.ts`
  - `fetchWithDomain`：普通 JSON/下载请求，覆盖调用方的 `forwarded`。
  - `requestWithDomain`：HTTP/SSE/二进制流式代理，覆盖调用方的 `forwarded`；普通响应保留
    15 秒总 deadline，Chat AG-UI SSE 仅在 route 明确选择时使用首部连接 deadline 与可续
    idle deadline，断流交给浏览器按 durable cursor 重连。
  - `getJsonWithDomain`：System manifest 的 JSON 请求变体。
- `iam-relay-policy.ts`：固定 BFF policy provenance、只读 browser GET 子集与 issuer cookie 入站过滤。
- `iam-relay-config.ts`：固定 Web origin、BFF origin 与 service identity 的共用 server-only 解析。
- `iam-interaction-csrf.ts`：sign-in 表单的一次性 Redis CSRF 摘要/目标 POST method/原始 query/issuer-cookie 绑定，
  原子 `GETDEL` 消费、短 TTL 与故障拒绝；Web 只写自己的前缀，不保存凭据。
- `iam-relay-transport.ts`：IAM 原生 HTTP 专用 transport，保持多个 `Set-Cookie`，实施 deadline、取消和
  header/body 限额；仅受控交互使用 POST，不复用会合并 cookie 的 Product transport。
- `iam-relay-response.ts`：原生 status/header/body、Location 与 issuer `Set-Cookie` 的出站校验。
- `oidc-provider.ts`：固定 provider/EdDSA、验证型 `client.callback` 与 server-only Basic/Bearer backchannel；Product Session 由 RP route 在身份准入后建立。
- `oidc-rp-transaction.ts`：300秒Redis state摘要、RP cookie绑定；先读取并验证完整MAC记录与浏览器binding，再Lua比较原值并原子消费，错proof不消耗原交易，只有一个并发回调入exchange；所有callback均不删除可能属于新登录的共享proof，成功只签发Product cookie，临时proof按原期限过期。
- `oidc-csrf.ts`：严格读取唯一、两段格式及摘要有效的Auth.js CSRF cookie，登录复用与session/signout校验共用。
- `oidc-login-recovery.ts`：GET/POST 顶层登录失败的固定产品返回，保 API JSON／status；精确 Proxy 路径承接 no-referrer 与 CSP，无自动重试。
- `product-login-return.ts`：`/login` 到 provider POST 的 HttpOnly 签名回跳目标 cookie；仅接受严格 Product 内部路径，provider 启动后立即清除。
- `oidc-bff-agent.ts`：token/userinfo/JWKS 每请求独立 5 秒绝对 deadline、响应头/正文 1 MiB 上限与浏览器 abort 连接取消。
- `product-identity.ts`：callback 建 session 与 refresh finalize 前调用固定 BFF `/v1/me`，严格核对
  OIDC subject 与 server-only fixed tenant；复用受信 Forwarded、5 秒 deadline、取消和 16 KiB 响应上限。

## 运行时规则

- `KOKORO_DOMAIN` 是独立产品部署的唯一域名上下文，部署时从环境注入；它不是 React prop、URL、body、
  localStorage 或用户可编辑字段。
- Product Web server → BFF 上游请求经 `upstream-http.ts` 。`/iam` 是固定 policy 的
  BFF-only 原生协议例外，使用 `iam-relay-transport.ts` 保持多 cookie，不读取 IAM URL；其公开边界只从
  server-only `KOKORO_WEB_ORIGIN` 读取，并据此校验入站 Host、GET 可选/POST 必需 Origin 与 Location；
  反代后 Next 重建的 request URL authority 和 `X-Forwarded-*` 不作公开 origin 判据。
- 浏览器提供的 `Host`、RFC 7239 `Forwarded`、tenant/site 字段不参与后端上下文选择；上游后端根据 RFC 7239 `Forwarded`
  完成租户解析、认证授权和数据隔离。
- route handler 使用 `runtime = "nodejs"`；SSE 与下载直接转发 Response body，不在 BFF 缓冲大响应。
- 业务面和 Chat 是 BFF-only：统一配置 `KOKORO_BFF_BASE_URL`，由独立 `kokoro-bff` 承接 `/v1/*`；当前
  Web 不读取 `KOKORO_SESSION_BASE_URL`，也不存在 Gateway fallback。
- `Session` 在当前运行时只表示 BFF Chat 资源和 `/api/session/*` 兼容路径；独立 `kokoro-session` 与
  `kokoro-gateway` 仅保留在历史/迁移资料中，不是运行、CI、部署或依赖入口。
- 原文令牌、密码和内部 header 绝不写入日志或浏览器响应。

## 协作边界

- `src/app/api/auth/*`：认证和会话 cookie。
- `src/app/api/session/[...path]`：兼容路径；实际转发到 BFF Chat 的 HTTP/SSE。
- `src/app/api/agents/[...path]`：Agent connection setup 的窄面 GET 代理。
- `src/app/api/team/*`：经在线 Product Session 取得单一 Bearer 后调用 BFF Team；tenant/actor 由后端受信上下文裁决。
- `src/app/api/hub/*`、`settings/*`、`mail/*`：Capability/MCP 的 BFF 兼容代理。
- `src/app/api/system/runtime-manifest`：System 公开 manifest 投影。
- `src/app/api/billing/*`：Billing/Payment 兼容读写面。
- `src/app/api/shared/[id]`：公共分享只读代理；不需要 Product Session，但仍携带 `web-bff` service auth
  和部署 RFC 7239 `Forwarded`，因此上游不会被匿名公网直接暴露。
- `src/app/iam/[...path]`：仅按固定 BFF policy 代理批准的原生 OAuth/IAM GET/POST；未知路由与未经批准的
  browser POST fail closed。`src/app/auth/sign-in/route.ts` 与静态 `/iam/interactions/*` 承载 Web-owned 表单；
  `/api/auth/[...nextauth]` 承载 Auth.js RP、Product Session 查询/刷新与正式退出。

### Chat 与业务承接

- 浏览器 Chat 只调用同源 `/api/session/*`；这里是 `kokoro-app` 的站点 BFF 入口，不新增第二套
  `/api/chat/*`。
- BFF 负责同源 Origin、HttpOnly 信封、请求体/错误边界和 public projection；Chat 的业务事实与
  HTTP 投影由 BFF 拥有；Agent 负责 Run、执行事件、SSE/HITL 适配与恢复，不创建独立 owner。
- Projects、Skills、Library、Scheduled、Agent setup 和 Billing 等跨服务用例，由独立
  `kokoro-bff` 的业务 adapter 编排；不要把这些规则塞回 Web，也不把 BFF 依赖塞入 `kokoro-agent`。

新增 Product 上游服务时必须复用 `upstream-http.ts`；固定 policy 的 IAM 原生 relay 是唯一已批准例外，
只能复用 `iam-relay-transport.ts`，不得扩成通用代理。route handler 禁止直接裸 `fetch`、手写 Host 或
手写部署/租户 header；浏览器 client 只能调用同源 BFF path。

- `model-publish-body.ts`：仅模型修订发布的有界EOF校验，证明Next空POST流，无正文生成或模型执行。
