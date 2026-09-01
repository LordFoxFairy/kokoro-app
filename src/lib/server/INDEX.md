# lib/server — BFF 服务端边界

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
- `service-config.ts`
  - `configuredBffBaseUrl(env?)`：读取独立业务 BFF 基址并去除尾斜杠。
  - `bffPathUrl(path, env?)`：生成版本化业务 BFF 地址。
- `upstream-http.ts`
  - `fetchWithDomain`：普通 JSON/下载请求，覆盖调用方的 `forwarded`。
  - `requestWithDomain`：HTTP/SSE/二进制流式代理，覆盖调用方的 `forwarded`。
  - `getJsonWithDomain`：System manifest 的 JSON 请求变体。

## 运行时规则

- `KOKORO_DOMAIN` 是独立产品部署的唯一域名上下文，部署时从环境注入；它不是 React prop、URL、body、
  localStorage 或用户可编辑字段。
- 所有 Web server → User、BFF、System、Billing、Shared 上游请求都经 `upstream-http.ts` 或
  `callerHeaders`，服务端统一附加 `Forwarded: host=<KOKORO_DOMAIN>`。
- 浏览器提供的 `Host`、RFC 7239 `Forwarded`、tenant/site 字段不参与后端上下文选择；上游后端根据 RFC 7239 `Forwarded`
  完成租户解析、认证授权和数据隔离。
- 认证信封只保存 runtime JWT、refresh token、用户和 namespace；不保存部署域名或内部 tenant id。
- route handler 使用 `runtime = "nodejs"`；SSE 与下载直接转发 Response body，不在 BFF 缓冲大响应。
- 业务面和 Chat 配置 `KOKORO_BFF_BASE_URL` 后统一进入独立 `kokoro-bff` 的 `/v1/*`；阶段 1 不依赖
  `KOKORO_SESSION_BASE_URL`，也不通过 Gateway fallback。
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

### Chat 与业务承接

- 浏览器 Chat 只调用同源 `/api/session/*`；这里是 `kokoro-app` 的站点 BFF 入口，不新增第二套
  `/api/chat/*`。
- BFF 负责同源 Origin、HttpOnly 信封、请求体/错误边界和 public projection；Chat 的业务事实与
  HTTP 投影由 BFF 拥有；Agent 负责 Run、执行事件、SSE/HITL 适配与恢复，不创建独立 owner。
- Projects、Skills、Library、Scheduled、Agent setup 和 Billing 等跨服务用例，由独立
  `kokoro-bff` 的业务 adapter 编排；不要把这些规则塞回 Web，也不把 BFF 依赖塞入 `kokoro-agent`。

新增上游服务时必须复用 `upstream-http.ts`，禁止在 route handler 中直接裸 `fetch`、手写 Host 或
手写部署/租户 header。浏览器 client 只能调用同源 BFF path。
