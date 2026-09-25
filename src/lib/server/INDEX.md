# lib/server — Web BFF 服务端边界

## 职责

把 User Web 的认证和上游服务调用留在 Next.js 服务端。浏览器只访问同源 `/api/*`，不接触
runtime token、内部服务地址、workload secret 或后端隔离键。

## 公开 API

- `session-envelope.ts`（framework-free，纯 node:crypto + zod）
  - `sealEnvelope(payload, secrets)`：AES-256-GCM 密封，secrets[0]=current；三段 base64url `iv.ct.tag`。
  - `openEnvelope(token, secrets, nowSec)`：解封并校验 exp；结构错、篡改、过期或全钥失败均返回 null。
  - `EnvelopePayload`：`{runtime_jwt, user_id, namespace, exp}`；部署域名不进入 cookie 信封。
- `auth.ts`（Next 感知装配）
  - `authConfig(env?)`：读取会话密钥、IAM/BFF 上游地址和当前部署的 `KOKORO_DOMAIN`；核心配置不完整时返回 null。
  - cookie：`SESSION_COOKIE`/`NONCE_COOKIE`、cookie options、`readCookie`/`readEnvelope`。
  - nonce：`newNonce`/`hashNonce`；`decodeJwtExp` 只解码不验签。
  - `callerHeaders`：组装 web-bff caller 凭据与服务端 RFC 7239 `Forwarded`。
  - `userRequestMagicLink`/`userConsumeMagicLink`/`userRefreshSession`/`userRevokeSession`：User 认证调用。
  - `sameOriginOk`：变更类请求的同源 Origin 守卫。
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
- `oidc-rp-transaction.ts`：300 秒 Redis state 摘要、RP cookie 绑定、原子一次消费及回调清理。
- `oidc-bff-agent.ts`：token/userinfo/JWKS 每请求独立 5 秒绝对 deadline、响应头/正文 1 MiB 上限与浏览器 abort 连接取消。
- `product-identity.ts`：callback 建 session 与 refresh finalize 前调用固定 BFF `/v1/me`，严格核对
  OIDC subject 与 server-only fixed tenant；复用受信 Forwarded、5 秒 deadline、取消和 16 KiB 响应上限。

## 运行时规则

- `KOKORO_DOMAIN` 是独立产品部署的唯一域名上下文，部署时从环境注入；它不是 React prop、URL、body、
  localStorage 或用户可编辑字段。
- Product Web server → BFF 上游请求经 `upstream-http.ts` 或 `callerHeaders`。`/iam` 是固定 policy 的
  BFF-only 原生协议例外，使用 `iam-relay-transport.ts` 保持多 cookie，不读取 IAM URL；其公开边界只从
  server-only `KOKORO_WEB_ORIGIN` 读取，并据此校验入站 Host、GET 可选/POST 必需 Origin 与 Location；
  反代后 Next 重建的 request URL authority 和 `X-Forwarded-*` 不作公开 origin 判据。
- 浏览器提供的 `Host`、RFC 7239 `Forwarded`、tenant/site 字段不参与后端上下文选择；上游后端根据 RFC 7239 `Forwarded`
  完成租户解析、认证授权和数据隔离。
- 认证信封只保存 runtime JWT、refresh token、用户和 namespace；不保存部署域名或内部 tenant id。
- route handler 使用 `runtime = "nodejs"`；SSE 与下载直接转发 Response body，不在 BFF 缓冲大响应。
- 业务面和 Chat 是 BFF-only：统一配置 `KOKORO_BFF_BASE_URL`，由独立 `kokoro-bff` 承接 `/v1/*`；当前
  Web 不读取 `KOKORO_SESSION_BASE_URL`，也不存在 Gateway fallback。
- `Session` 在当前运行时只表示 BFF Chat 资源和 `/api/session/*` 兼容路径；独立 `kokoro-session` 与
  `kokoro-gateway` 仅保留在历史/迁移资料中，不是运行、CI、部署或依赖入口。
- 原文 magic-link token、nonce、refresh token 和内部 header 绝不写入日志或浏览器响应。

## 协作边界

- `src/app/api/auth/*`：认证和会话 cookie。
- `src/app/api/session/[...path]`：兼容路径；实际转发到 BFF Chat 的 HTTP/SSE。
- `src/app/api/agents/[...path]`：Agent connection setup 的窄面 GET 代理。
- `src/app/api/team/*`：User team BFF；namespace 与 actor 从密封信封派生。
- `src/app/api/hub/*`、`settings/*`、`mail/*`：Capability/MCP 的 BFF 兼容代理。
- `src/app/api/system/runtime-manifest`：System 公开 manifest 投影。
- `src/app/api/billing/*`：Billing/Payment 兼容读写面。
- `src/app/api/shared/[id]`：公共分享只读代理；不需要用户信封，但仍携带 `web-bff` service auth
  和部署 RFC 7239 `Forwarded`，因此上游不会被匿名公网直接暴露。
- `src/app/iam/[...path]`：只读 browser GET relay；直接 browser POST、userinfo、end-session 与未知路由
  fail closed。`src/app/auth/sign-in/route.ts` 与静态 `/iam/interactions/*` 已接线 Web-owned 表单；
  本工作树 `/api/auth/[...nextauth]` 仅 RP transaction/callback，不签发 Product Session。

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
