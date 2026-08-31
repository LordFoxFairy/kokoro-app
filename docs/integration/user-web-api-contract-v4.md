# User Web API Contract v4（kokoro 当前实现审计版）

> **范围**：仅对应本地独立子仓库 `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro`（package `@kokoro/app`）。本文不跨父仓库或其他 A/B 仓库取路由、schema、环境变量或状态。
>
> **审计日期**：2026-08-31
>
> **事实来源优先级**：`src/app/api` 与运行时代码 > `src/contract`、`src/hub`、`src/agents`、`src/system` 的 schema/client > 相关 tests > `docs/integration/mock-fixture-matrix-v1.md`。mock-fixture matrix 是验收目标与测试夹具矩阵，不是当前后端路由清单。
>
> **状态声明**：当前链路由 `kokoro-app` 的同源 Web BFF 承接；`kokoro-gateway` 只是 planned repository，当前不在 live upstream 链路中，且本文不表示它已创建或已部署。

## 0. 状态标签与范围边界

| 标签 | 含义 |
|---|---|
| **Preview closed** | 当前前端在本地/测试夹具内可完成闭环；数据只存在内存、`localStorage`、`sessionStorage` 或确定性 fixture，不声称已写入服务端。 |
| **Live conditional** | 当前子仓库有真实浏览器路径、BFF 与客户端解析；只有对应 server-only 上游环境变量和上游服务都具备时才闭环。 |
| **Client target / not closed** | 源码里有客户端类型或调用目标，但当前 `src/app/api` 没有对应路由、没有接线或没有可验证的回执契约。 |
| **Local UI only** | 纯前端状态，不产生 API 请求。 |

本版只冻结下列七个 surface：

- Chat
- Agent connection setup
- Skills
- Library
- Scheduled
- Capsule
- Runtime manifest

Projects、billing、team、mail、settings、shared 等其他实现只在需要说明路径别名或边界时出现，不在本文新增接口。

## 0.1 Chat 的统一业务/网关承接

Chat 的前端承接已经冻结为本仓库的同源 `/api/session/*` 契约。浏览器不直接访问
Session/Agent 内部服务，也不直接携带站点、租户、工作负载 token 或内部 secret。

```text
当前：
kokoro-app（Web UI） → 同源 /api/session/*（当前 Web BFF）
                    → KOKORO_SESSION_BASE_URL（当前 live upstream）

规划迁移（gateway 接入后）：
kokoro-app（Web UI） → 同源 /api/session/*（保持不变）
                    → planned LordFoxFairy/kokoro-gateway
                    → Session / Agent runtime
```

`LordFoxFairy/kokoro-gateway` 当前只是规划中的独立仓库名，不代表本 checkout 已包含该
仓库、已经完成远端创建或已进入当前 upstream 链路。它的职责是承接跨产品的业务编排，而不是承接 Web 页面：认证与
权限、域名上下文、会话/消息/Run 生命周期、SSE 事件、HITL 控制、幂等、错误映射、审计
request id，以及向 Session/Agent runtime 的服务间调用。`kokoro-app` 只负责桌面 UI、浏览器
状态、同源 BFF 传输和 public projection。

| 责任 | kokoro-app | gateway（规划） | Session/Agent runtime |
|---|---|---|---|
| 页面、Composer、胶囊与交互 | 负责 | 不负责 | 不负责 |
| 浏览器同源路径 | `/api/session/*` | 通过网关适配上游 | 不直接暴露 |
| 登录信封、权限上下文、域名绑定 | 不读取内部 token；仅发送同源请求 | 服务端解析并校验 | 执行 runtime 级授权 |
| 消息、Run、SSE、暂停/恢复/取消 | 调用稳定契约并渲染状态 | 编排、幂等、错误和协议转换 | 生成模型/工具执行事件 |
| 业务数据与跨产品规则 | 不持有 | 负责 | 负责执行侧状态 |

迁移规则：未来 gateway 接入时，优先只替换当前 BFF 后面的 upstream；浏览器继续使用本版
`/api/session/*` 路径、请求体、响应体和 SSE event name。若必须改变业务语义，先在 gateway
提供兼容适配和版本化契约，再升级 Web，不把内部服务路径泄漏到组件中。

仓库边界规则：本仓库不引入 `src/site`、其它产品的源码、跨仓库相对路径或 git submodule。
未来共享 package 只发布浏览器安全的 TypeScript 类型、Zod schema、事件常量和 client 接口；
业务规则、数据库、服务凭据、runtime adapter 与 gateway 实现留在各自后端仓库。这样每个
site/product 仍是一套独立 Web 子仓库，Chat 只通过稳定 API 契约与统一网关对接。

## 1. 当前 API 路由注册表

与本版相关的 `src/app/api` 实际文件如下：

| 浏览器路径 | 实际实现 | 本版用途 |
|---|---|---|
| `/api/session/*` | `src/app/api/session/[...path]/route.ts` | Chat、artifact/library、文件、delivery、share 的同源 BFF |
| `/api/hub/*` | `src/app/api/hub/[...path]/route.ts` | Skills、MCP、connectors，以及现有 project catch-all |
| `/api/settings/*` | `src/app/api/settings/[...path]/route.ts` | Hub 的 `settings` 前缀别名 |
| `/api/mail/*` | `src/app/api/mail/[...path]/route.ts` | Hub 的 `mail` 前缀别名 |
| `/api/system/runtime-manifest` | `src/app/api/system/runtime-manifest/route.ts` | Runtime manifest |
| `/api/auth/session-state` | `src/app/api/auth/session-state/route.ts` | Preview/authenticated/anonymous 闸门 |
| `/api/dev/preview-files/preview-delivery-report` | `src/app/api/dev/preview-files/[key]/route.ts` | 非 production 的单一 delivery PDF 夹具 |

同一目录还注册了 auth callback/logout/magic-link、billing、shared、team 等其他路由；它们不属于本版七个 surface。

当前路由树中**没有**下列独立路由，因此本文不把它们写成 canonical API：

- `/api/tasks*`
- `/api/projects*`
- `/api/scheduled-tasks*`
- `/api/skills*`
- `/api/library*`
- `/api/artifacts*`
- `/api/agents/connections/setup`
- `/api/capsules*`
- `/api/manifest*`

其中 `/api/session/*` 与 `/api/hub/*` 是真实 catch-all BFF；使用它们时，必须以本版列出的子路径为准，前端不得自行扩展为不存在的业务路由。

## 2. 公共传输与身份契约

### 2.1 浏览器与上游的路径映射

浏览器只访问同源相对路径：

```text
/api/session/<path>  →  ${KOKORO_SESSION_BASE_URL}/<path>
/api/hub/<path>      →  ${KOKORO_HUB_BASE_URL}/hub/<path>
/api/settings/<path> →  ${KOKORO_HUB_BASE_URL}/hub/settings/<path>
/api/mail/<path>     →  ${KOKORO_HUB_BASE_URL}/hub/mail/<path>
```

BFF 统一使用 `runtime: nodejs` 与 `dynamic: force-dynamic`（manifest route 为 nodejs），不把服务地址编入浏览器 bundle。

### 2.2 Session BFF

`/api/session/*` 的真实行为：

1. `authConfig()` 缺少必需配置时返回 `503 {"error":"auth_not_configured"}`。
2. `POST/PUT/PATCH/DELETE` 会执行同源 Origin 检查；Origin 与请求 Host 不一致返回 `403 {"error":"forbidden_origin"}`。
3. 从 HttpOnly `kokoro_session` cookie 读取 sealed envelope；缺失或失效返回 `401 {"error":"unauthenticated"}`。
4. 服务端注入 `Authorization: Bearer <runtime_jwt>`、`x-kokoro-service: web-bff`、可选 `x-kokoro-internal-secret`、`x-kokoro-request-id`。
5. 只接收浏览器的 `accept`、`content-type`、`last-event-id`；不转发 cookie。
6. 上游不可达返回 `502 {"error":"session_unreachable"}`；上游 HTTP 状态、JSON、SSE、二进制 body 按原状态流式回传。
7. access/refresh 即将过期时，BFF 续签并把新的 sealed cookie 通过 `Set-Cookie` 写回浏览器。

### 2.3 Hub BFF

`/api/hub/*` 的真实行为：

1. `authConfig()` 缺少基础配置返回 `503 {"error":"auth_not_configured"}`。
2. `KOKORO_HUB_BASE_URL` 缺失返回 `503 {"error":"hub_not_configured"}`。
3. mutation 的 Origin 不匹配返回 `403 {"error":"forbidden_origin"}`；无有效 sealed session 返回 `401 {"error":"unauthenticated"}`。
4. 服务端从 envelope 派生并覆盖身份头：`x-kokoro-namespace`、`x-kokoro-user-id`；namespace 不接受浏览器 query/body/header 选择。
5. 注入 `x-kokoro-service: web-bff`、可选 internal secret、`x-kokoro-request-id`；只转发 `accept`、`content-type`、`idempotency-key`。
6. 上游目标固定为 `${KOKORO_HUB_BASE_URL}/hub/<path>`；上游不可达返回 `502 {"error":"hub_unreachable"}`。
7. Hub 成功/错误体由 Hub client 解析；canonical Hub 成功包为 `{"data": ...,"requestId"?}`，canonical Hub 错误包为 `{"error":{"code":string,"message":string},"requestId"?}`。

### 2.4 Domain / Forwarded

- `KOKORO_DOMAIN` 是 server-only 部署域名，经过 DNS label 校验、去掉一个末尾点并转小写。
- 出站请求先删除浏览器可控的 `host`、`forwarded`、`x-forwarded-host`、`x-forwarded-proto`、`x-forwarded-for`、`x-domain`、`x-kokoro-tenant-id`、`x-kokoro-site-id`，再写入唯一 `Forwarded: host=<KOKORO_DOMAIN>`。
- `Forwarded` 只存在于 BFF → upstream 的服务端 wire；BFF 的浏览器响应不暴露该 header。它是路由上下文，不是认证凭据；服务身份仍由 `x-kokoro-service: web-bff` 与生产 internal secret / 等价网关 ACL 提供。
- Hub 的 `x-kokoro-namespace` 请求头只由 BFF 从 sealed session 派生，浏览器不能选择或覆盖；但 `namespace` 可按已声明的 Hub public response schema 出现在浏览器可见的配额/上传投影中，仅用于展示/结果投影，不是入站身份依据。
- 浏览器请求不得携带或选择 `tenantId`、namespace、site、internal secret、workload token、runtime JWT 作为身份上下文；浏览器伪造同名 header 也不改变上游上下文。

## 3. 环境来源与 Preview/Live 选择

### 3.1 环境文件

| 环境 | 来源 | 典型域名 | Preview 规则 |
|---|---|---|---|
| local | `.env.local`，由 `pnpm dev` 读取 | `dev.kokoro.localhost` | 非 production 且 `NEXT_PUBLIC_SESSION_PREVIEW=1` 时启用 |
| test | `.env.test` 或测试隔离注入 | `test.kokoro.localhost` | 可启用同一 preview fixture |
| prod | 显式 `.env.prod`、`.env.production` 或平台运行时变量 | 部署绑定域名，例如 `app.example.com` | 不启用 Preview Client |

当前 checkout 的 `.env.local` 使用 `NEXT_PUBLIC_SESSION_PREVIEW=1`，所以本地默认是 preview。取消 preview 后，必须填入 server-only 的 `KOKORO_WEB_SESSION_SECRET`、`KOKORO_USER_BASE_URL`、`KOKORO_SESSION_BASE_URL`、合法 `KOKORO_DOMAIN`；production 还要求 `KOKORO_INTERNAL_SECRET_WEB_BFF`。

可选 live upstream：

- `KOKORO_SYSTEM_BASE_URL`
- `KOKORO_HUB_BASE_URL`
- `KOKORO_SYSTEM_WORKLOAD_TOKEN`
- payment/billing 变量不属于本版七个 surface。

`KOKORO_DOMAIN` 不属于浏览器 selector。 `alpha.fixture.test`、`beta.fixture.test` 仅是测试/integration 的合成 deployment binding，不是额外仓库、额外环境或用户可切换域名。

### 3.2 各 surface 的客户端选择

| Surface | Preview 入口 | Live 入口 | 当前闭环状态 |
|---|---|---|---|
| Chat | `previewClientFromEnv()` / `createPreviewClient` | `createSessionClient({baseUrl:"/api/session"})` | Preview closed；Live conditional |
| Agent | `createPreviewAgentClient` | `createAgentClient` | Preview closed；Live client target，但当前 BFF route 未注册 |
| Skills/MCP | `createPreviewHubClient` | `createHubClient` → `/api/hub` | Preview closed；Live conditional |
| Library | Preview session client 的空 artifact 列表，或显式 fixture | `/api/session/artifacts` | Preview closed；Live conditional |
| Scheduled | `preview=true` 时 localStorage | 需注入 `ScheduledTaskClient` | 独立页面 Preview closed；Live client 未接线 |
| Capsule | React state + `sessionStorage` | 无 live transport | Local UI only |
| Manifest | `PREVIEW_RUNTIME_MANIFEST` | `GET /api/system/runtime-manifest` | Preview closed；Live conditional |

关键规则：live 请求失败时，Manifest、Chat、Hub、显式 live Library client 都保持错误态；不会把 live 错误静默替换成 fixture。Scheduled 在没有注入 adapter 时也保持 unavailable/error，不猜测路由。

## 4. Runtime Manifest

### 4.1 Preview

Preview 不发 HTTP 请求，直接使用 `src/system/preview-runtime.ts` 的：

```ts
type PreviewRuntimeManifest = {
  brand: { name: string; mark: string; logoUrl?: string }
  navigation: { key: string; label: string; icon: string; href?: string; featureFlag?: string }[]
  capabilities: { key: string; label: string; description: string }[]
  locale: string
  theme?: Record<string, string>
  featureFlags?: { key: string; enabled: boolean }[]
  configVersion?: string
  digest?: string
}
```

默认 preview 值是本地 fixture；不包含 tenant 身份。

### 4.2 Live HTTP

```http
GET /api/system/runtime-manifest?product_id=kokoro&locale=<BCP47>&surface_id=user-web
Accept: application/json
```

参数：

| 参数 | 要求 |
|---|---|
| `product_id` | 可选；缺省按实现补为 `kokoro`，当前 AppGate 总是显式发送 `kokoro` |
| `locale` | 可选，默认 `en-US`；匹配 `^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$` |
| `surface_id` | 可选；当前客户端发送 `user-web` |

System upstream 返回的内部形状：

```ts
type RuntimeManifestUpstream = {
  tenantId: string
  productId: string
  locale: string
  navigation: unknown[]
  localeNamespaces: unknown[]
  theme: Record<string, unknown>
  featureFlags: unknown[]
  references: unknown[]
  configVersion: string
  releaseId: string | null
  digest: string
}
```

BFF 只返回 public projection，移除 `tenantId`：

```json
{
  "data": {
    "productId": "kokoro",
    "locale": "en-US",
    "navigation": [],
    "localeNamespaces": [],
    "theme": {},
    "featureFlags": [],
    "references": [],
    "configVersion": "CONFIG_VERSION",
    "releaseId": null,
    "digest": "DIGEST"
  }
}
```

实际 response schema 对 `data` 以上字段做 Zod 校验；`productId`、`locale` 必须与请求参数一致。响应带 `Cache-Control: private, no-store`。

BFF 出站会发送：

- `x-kokoro-service: web-bff`
- `x-kokoro-request-id`
- 非 production/已配置时的 `x-kokoro-internal-secret`
- 可选 `x-kokoro-actor-id`（从 sealed envelope 的 `user_id` 派生）
- 可选 `Authorization: Bearer <KOKORO_SYSTEM_WORKLOAD_TOKEN>`
- 由 `KOKORO_DOMAIN` 生成的 `Forwarded`

不提供 system base/domain 或 production 缺 internal secret 时，返回 `503 {"error":"system_runtime_unavailable"}`；请求参数非法返回 `400 {"error":"invalid_runtime_manifest_request"}`；上游不匹配 schema 或 product/locale 时返回 `503 {"error":"invalid_runtime_manifest_response"}`。

### 4.3 UI 边界

`useRuntimeManifest({preview})` 的 `source` 为 `preview | loading | live | error`。Live manifest 失败保持 `error`，不回退到 `PREVIEW_RUNTIME_MANIFEST`。navigation、theme、brand logo 在浏览器还会进行同源 href、CSS token、HTTPS logo 的 allowlist 投影。

## 5. Chat / Session

### 5.1 Base 与响应形状

Chat client 的 base 固定为 `/api/session`。Session contract 使用 flat JSON，不套通用 `ApiSuccess` envelope：

- 列表：`{sessions, next_cursor?}`
- snapshot：`{session, messages?, active_run?, pending_pauses, files, deliveries, event_watermark}`
- receipt：各自的 flat object
- 错误：`{error: string}`

BFF 只负责认证、代理和流式转发；上游 session service 负责这些 flat contract 的最终返回。

### 5.2 HTTP 接口

#### 会话列表

```http
GET /api/session/sessions
GET /api/session/sessions?scope=direct&cursor=CURSOR
GET /api/session/sessions?project_ref=PROJECT_REF&cursor=CURSOR
```

- 默认 scope 是 direct；project scope 用不透明的 `project_ref`。
- `project_ref` 是项目归属引用，不是 tenant/site/namespace。
- 响应：

```ts
type SessionList = {
  sessions: Array<{
    session_id: string
    title: string
    updated_at: string
  }>
  next_cursor?: string
}
```

#### 创建消息 / 启动 run

```http
POST /api/session/sessions/{session_id}/messages
Content-Type: application/json
```

```ts
type MessageCreateParams = {
  idempotency_key: string
  content: string
  model?: string
  agent?: string
  thinking?: boolean
  pinned_skills?: string[]
  mcp_servers?: string[]
  project_ref?: string
}
```

body 是 strict schema；`idempotency_key` 与 `content` 非空。当前 client 把幂等键放在 JSON body，不额外发送 `Idempotency-Key` header。成功：

```ts
type MessageCreateReceipt = {
  run_id: string
  user_message_id: string
  assistant_message_id: string
}
```

同一轮重试使用同一 `idempotency_key`；已收到 run failed 后，下一次提交使用新 key。当前 capsule 的 `creationIntent` 不进入该 body。

#### Snapshot

```http
GET /api/session/sessions/{session_id}
```

成功：

```ts
type SessionSnapshot = {
  session: {
    session_id: string
    title: string
    owner_id: string
    created_at: string
    updated_at: string
  }
  messages?: Array<{
    message_id: string
    role: "user" | "assistant"
    content: string
    status: "pending" | "streaming" | "completed" | "failed"
    created_at: string
    run_id?: string
  }>
  active_run?: { run_id: string; status: string }
  pending_pauses: Array<{
    pause_id: string
    run_id: string
    tool_id: string
    segment_id: string
    tool_name: string
    kind: "tool_approval" | "ask_user_question" | "result_review" | "input"
    args: Record<string, unknown>
    description: string
    allowed_decisions: Array<"approve" | "edit" | "reject" | "respond" | "submit">
    risk?: { level: string; source: string; reason: string }
    editable: boolean
    input_schema?: Record<string, unknown>
    result?: string
    status: "pending" | "resolved" | "cancelled" | "expired"
    decision?: Record<string, unknown>
    created_at: string
    resolved_at?: string
  }>
  files: Array<{ path: string; mime: string; bytes: number }>
  deliveries: Array<{
    content_hash: string
    path: string
    title: string
    mime: string
    size: number
    run_id: string
    created_at: string
  }>
  event_watermark: number
}
```

`404` 或 `410` 在 SessionClient 中表示服务端没有可水合会话并解析为 `null`；其他非 2xx 是 HTTP error。

#### SSE events

```http
GET /api/session/sessions/{session_id}/events
Accept: text/event-stream
Last-Event-ID: <last seq, header name: last-event-id>
```

当前实现不用 EventSource，而是 fetch stream；按空行切 SSE frame，将多行 `data:` 拼接后作为 JSON 解析。每个 data payload 必须符合：

```ts
type SessionEvent = {
  event_id: string
  seq: number
  session_id: string
  run_id: string
  timestamp: string
  kind:
    | "session.created"
    | "run.created"
    | "message.user"
    | "message.delta"
    | "message.completed"
    | "thinking.delta"
    | "tool.invoked"
    | "tool.output.delta"
    | "tool.awaiting_approval"
    | "tool.returned"
    | "delivery.created"
    | "todo.updated"
    | "subagent.started"
    | "subagent.finished"
    | "subagent.thinking.delta"
    | "subagent.text.delta"
    | "subagent.text.completed"
    | "subagent.tool.invoked"
    | "subagent.tool.returned"
    | "run.completed"
    | "run.failed"
  payload: unknown
}
```

实际 payload contract：

| `kind` | payload |
|---|---|
| `session.created` | `{title, owner_id}` |
| `run.created` | `{run_id}` |
| `message.user` | `{message_id, content}` |
| `message.delta` | `{segment_id, delta}` |
| `message.completed` | `{segment_id, content}` |
| `thinking.delta` | `{segment_id, delta}` |
| `tool.invoked` | `{segment_id, tool_id, name, args}` |
| `tool.output.delta` | `{segment_id, tool_id, name, delta}` |
| `tool.awaiting_approval` | `{segment_id, tool_id, name, args, description, allowed_decisions, kind, risk?, editable, input_schema?, pending_tool_ids, result?}` |
| `tool.returned` | `{segment_id, tool_id, name, result, is_error, truncated?, rejected?, reject_reason?, responded?, summary?}` |
| `delivery.created` | `{path, title, mime, size, content_hash, note?}` |
| `todo.updated` | `{todos: [{content, status: "pending"|"in_progress"|"completed"}]}` |
| `subagent.started` | `{segment_id, subagent_id, name, description, subagent_type, source: "built-in"|"config-custom"|"runtime-custom"}` |
| `subagent.finished` | `{segment_id, subagent_id, name, subagent_type, source, failed?, error?}` |
| `subagent.thinking.delta` | `{segment_id, subagent_id, delta}` |
| `subagent.text.delta` | `{segment_id, subagent_id, text}` |
| `subagent.text.completed` | `{segment_id, subagent_id, text}` |
| `subagent.tool.invoked` | `{segment_id, subagent_id, tool_id, name, args}` |
| `subagent.tool.returned` | `{segment_id, subagent_id, tool_id, name, result, is_error, truncated?}` |
| `run.completed` | `{status: "completed"|"cancelled", token_usage?: {input_tokens, output_tokens}|null}` |
| `run.failed` | `{code, error_kind, message}`，code 为 `token_budget_exceeded`、`recursion_limit_exceeded`、`assembly_failed`、`enqueue_failed`、`dispatch_exhausted`、`contract_incompatible`、`internal_error` 之一 |

断线会以最后已见 `seq` 通过 `last-event-id` 重连，默认间隔 2 秒；事件按 `event_id` 去重，状态机丢弃 stale/late 结果。

#### Run control / HITL

```http
POST /api/session/sessions/{session_id}/runs/{run_id}/control
Content-Type: application/json
```

取消：

```json
{"kind":"run.cancel","decision_id":"DECISION_ID"}
```

恢复 HITL：

```json
{
  "kind": "run.resume",
  "decision_id": "DECISION_ID",
  "decisions": [
    {"type":"approve","tool_id":"TOOL_ID"},
    {"type":"edit","tool_id":"TOOL_ID","args":{}},
    {"type":"reject","tool_id":"TOOL_ID","reason":"REASON"},
    {"type":"respond","tool_id":"TOOL_ID","response":"RESPONSE"},
    {"type":"submit","request_id":"REQUEST_ID","value":"VALUE"}
  ]
}
```

- `run.resume.decisions` 至少一项。
- `approve` 可带 `args?`；`edit` 要求 `args`；`reject` 可带 `reason?`；`respond` 要求 `response`；`submit` 使用 `request_id/value`。
- 成功回执：`{"ok":true}`。
- 当前状态机按同一 pause stage 聚合 `pending_tool_ids`，一次发送一个 `run.resume`；相同 `decision_id` 可重试。 `run_not_active`、`no_pending_pause`、`session_deleted` 触发 snapshot 对账。

#### 会话变更

```http
DELETE /api/session/sessions/{session_id}
PATCH /api/session/sessions/{session_id}/title
Content-Type: application/json
```

rename body / response：

```json
{"title":"NEW_TITLE"}
```

```json
{"ok":true}
```

delete response：

```json
{"status":"STATUS"}
```

delete 是软删除语义；实现注释约定不存在/已删除均为 `202`，服务端状态位是最终事实。

#### Models / agents candidates

```http
GET /api/session/models
GET /api/session/agents
```

```ts
type ModelCandidateList = {
  models: Array<{
    provider: string
    name: string
    is_default: boolean
    display_name?: string
  }>
}

type AgentCandidateList = {
  agents: Array<{
    name: string
    description: string
    is_default: boolean
  }>
}
```

#### Share

```http
POST   /api/session/sessions/{session_id}/share
DELETE /api/session/sessions/{session_id}/share
```

POST 成功 `{"share_id":"SHARE_ID"}`；DELETE 成功 `{"ok":true}`。当前 client 的 share POST body 为 `{}`，不发送额外幂等 header。

#### Session files / deliveries

这些是 Session contract 已声明的读取路径，BFF 以流式 body 转发：

```http
GET /api/session/sessions/{session_id}/files/{path}
GET /api/session/sessions/{session_id}/deliveries/{content_hash}
```

列表 snapshot 中的 `files` / `deliveries` 只提供元数据；实际内容不套 JSON envelope，响应 content type、content disposition、content length 等由 BFF 传递。

## 6. Agent connection setup

### 6.1 Preview closed（仅 Preview 闭环）

`src/agents/preview-client.ts` 提供本地确定性结果：

```ts
type AgentPlatform = "telegram" | "line" | "slack"

type AgentConnectionSetup = {
  platform: AgentPlatform
  status: "disconnected" | "pending" | "connected" | "expired"
  qr_value: string
  continue_url: string
  expires_at: string
}
```

preview 值使用 `https://agents.fixture.test/connect?...&ticket=preview` 与对应 continue URL；不发 network request。UI 用 `expires_at` 与当前时间再次判断过期，过期时禁用 continue 并允许 retry。

### 6.2 Live client target（Live not closed）

`src/agents/client.ts` 的唯一 live client target 是：

```http
GET /api/agents/connections/setup?platform=telegram|line|slack
```

响应要求是上面的 flat `AgentConnectionSetup`，不是 `{data:...}`。

**当前路由事实**：`src/app/api` 没有 `agents/connections/setup` 文件或 catch-all。因而该路径当前只属于 client target/test target，不属于已接通的 live API；调用方会收到非 2xx 并转为 `AgentClientError(status)`。本版不添加 `/api/agents/*` 路由，也不虚构 `KOKORO_AGENT_BASE_URL` 或上游 response。

## 7. Skills 与 Hub / MCP / library-adjacent connectors

### 7.1 Hub 路径和包络

浏览器使用 `/api/hub` 前缀，BFF 上游使用 `/hub` 前缀：

```text
/api/hub/self/... → ${KOKORO_HUB_BASE_URL}/hub/self/...
```

除无 body mutation 外，Hub client 通过：

```ts
type HubData<T> = { data: T; requestId?: string }
type HubError = { error: { code: string; message: string }; requestId?: string }
```

解析。所有读取使用 `cache: "no-store"`。Hub client 对 network/http/parse/aborted 分别抛出 typed `HubClientError`；UI 不把 live parse/http error 当空目录。

### 7.2 Skill pool / catalog / quota / revisions

#### 已启用池

```http
GET /api/hub/self/skills/pool
```

```ts
type SkillCard = {
  name: string
  description: string
  content_hash: string
  scope: string
  enabled?: boolean
  categories?: Array<"coding"|"data"|"automation"|"business"|"design"|"media"|"content">
  updated_at?: number
}

type SkillPool = { skills: SkillCard[] }
```

wire 成功：`{"data":{"skills":[...]}, "requestId"?}`。pool 是 enabled/available projection，不等同于发现目录。

#### 发现目录

```http
GET /api/hub/self/skills/catalog
GET /api/hub/self/skills/catalog?scope=official|third_party&query=QUERY&cursor=CURSOR
```

```ts
type SkillCatalogCard = SkillCard & {
  installed: boolean
  enabled: boolean
}
type SkillCatalog = {
  skills: SkillCatalogCard[]
  next_cursor?: string | null
}
```

UI 对 `official` 与 `third_party` 分别分页至 `next_cursor=null`，并按 `scope/name` 去重；query 是 Hub query 参数，category/search 的部分筛选在本地完成。

#### 配额

```http
GET /api/hub/self/skills/quota
```

```ts
type SkillQuota = {
  namespace: string
  package_count: number
  package_bytes: number
  max_packages: number
  max_bytes: number
}
```

#### 版本历史

```http
GET /api/hub/self/skills/{name}/revisions
GET /api/hub/self/skills/{name}/revisions?scope=SCOPE
```

```ts
type SkillRevision = {
  scope: string
  name: string
  revision: number
  content_hash: string
  package_size: number
  source: string
  created_at: number
}
type SkillRevisions = { revisions: SkillRevision[] }
```

`name` 做 `encodeURIComponent`；scope 用 query，namespace 仍由 sealed session 派生。

### 7.3 Skill enable/disable

```http
POST /api/hub/self/skills/{name}/enable?scope=SCOPE
POST /api/hub/self/skills/{name}/disable?scope=SCOPE
Idempotency-Key: skill-toggle:...
```

响应只检查 HTTP status，不解析成功 body。scope 用来消除 official/third_party/personal 同名技能歧义。当前 client 为每次 toggle 生成幂等键，并由 Hub BFF 透传。

### 7.4 ZIP / .skill 上传

浏览器文件边界接受 `.zip` / `.skill`；请求是 multipart，字段名固定为 `file`，文件名由 client 发送为 `skills.zip`。

预检：

```http
POST /api/hub/self/skills/upload/preview
Content-Type: multipart/form-data
file=<ZIP>
```

```ts
type UploadPreview = {
  namespace: string
  candidates: Array<{
    name: string
    valid: boolean
    errors: string[]
    description: string | null
    content_hash: string | null
    package_size: number
    file_count: number
    files: Array<{path: string; size: number}>
    conflicts: {official: boolean; namespace: boolean}
  }>
}
```

确认发布：

```http
POST /api/hub/self/skills/upload/confirm
Content-Type: multipart/form-data
Idempotency-Key: skill-upload:...
file=<ZIP>
names=<JSON encoded string[]; optional>
```

```ts
type UploadConfirm = {
  namespace: string
  results: Array<{
    name: string
    status: "published" | "unchanged" | "failed"
    revision: number | null
    content_hash: string | null
    error: string | null
  }>
}
```

UI 先预检、再选择 candidate、再确认；关闭 dialog 或卸载时 abort。只有 confirm 成功才标记 published。预检不产生持久化声明。

### 7.5 GitHub skill preview/import

client 先把输入规范化为 canonical repository：

```text
https://github.com/OWNER/REPOSITORY
```

要求 HTTPS、无 port/userinfo/query/hash、恰好 owner/repository 两段，去除可选 `www.`、尾部斜杠与 `.git`。wire body：

```json
{"repository":"https://github.com/OWNER/REPOSITORY"}
```

预览：

```http
POST /api/hub/self/skills/github/preview
Content-Type: application/json
```

导入：

```http
POST /api/hub/self/skills/github/import
Content-Type: application/json
Idempotency-Key: skill-github-import:<stable hash>
```

响应均为 Hub `data` envelope：

```ts
type GithubImportResult = {
  repository: string
  default_branch: string
  skill: {
    name: string
    description: string | null
  }
}
```

`previewGithub` 与 `importGithub` 支持 AbortSignal；import 的幂等键基于 canonical URL 的稳定 hash，不把 URL 放进 header。UI 只有 import 成功时才通知“已导入”；只有 preview 时不声称已持久化。Hub client 将这两个方法作为可选扩展，因为 preview client/adapter 可能不提供其中之一。

### 7.6 MCP server / secret / custom connector

这些是 Skills settings 同一个 Hub self 面的真实兼容接口，不是独立 `/api/mcp` 路由。

#### MCP server pool

```http
GET /api/hub/self/mcp/servers
```

```ts
type McpServerView = {
  scope: string
  name: string
  revision: number
  transport: "http" | "streamable_http"
  url: string
  allowed_tools: string[]
  secret_ref: string | null
  enabled: boolean
}
type McpServerPool = { servers: McpServerView[] }
```

#### Register

```http
POST /api/hub/self/mcp/servers
Content-Type: application/json
```

输入：

```ts
type McpRegisterInput = {
  name: string
  transport: "http" | "streamable_http"
  url: string
  allowed_tools: string[]
  secret_ref: string | null
}
```

当 `secret_ref=null` 时当前 client 从 wire body 省略该字段；非 null 时发送引用。secret_ref 只允许引用句柄，不是 secret value。

成功是 `{"data":{"server":McpServerView}, "requestId"?}`。

#### Enable/disable/delete

```http
POST   /api/hub/self/mcp/servers/{name}/enable
POST   /api/hub/self/mcp/servers/{name}/disable
DELETE /api/hub/self/mcp/servers/{name}
Idempotency-Key: hub-mutation:...
```

成功只检查 status；name 做 `encodeURIComponent`。

#### Secret handles

```http
GET    /api/hub/self/mcp/secrets
POST   /api/hub/self/mcp/secrets
DELETE /api/hub/self/mcp/secrets/{handle}
Content-Type: application/json
```

创建 body `{"name":"SECRET_NAME","value":"SECRET_VALUE"}`，成功 data 为 `{"handle":"HANDLE"}`。列表只回显句柄：

```ts
type McpSecret = {
  handle: string
  name: string
  createdAt: number
}
type McpSecretList = { secrets: McpSecret[] }
```

value 只写入，不从任何 response 返回；delete 使用 Hub mutation idempotency key。

#### Custom MCP

```http
POST /api/hub/self/connectors/mcp
Content-Type: application/json
```

```ts
type CustomMcpRegisterInput = {
  name: string
  transport: "http" | "streamable_http"
  endpoint_url: string
  icon_asset_id: string | null
  instructions: string | null
  headers: Array<{name: string; value: string}>
  enabled: boolean
}
```

成功包 data 为 `{server: McpServerView}`。header values 是 write-only UI 输入；当前 client 不给 register/custom MCP 单独生成 Idempotency-Key。

#### Custom API

```http
POST /api/hub/self/connectors/custom-apis
Content-Type: application/json
```

```ts
type CustomApiCreateInput = {
  name: string
  notes: string | null
  icon_asset_id: string | null
  secrets: Array<{name: string; value: string}>
  enabled: boolean
}

type CustomApiView = {
  id: string
  kind: "custom_api"
  name: string
  notes: string | null
  icon_url: string | null
  secret_entries: Array<{
    id: string
    name: string
    created_at: string
    updated_at: string
    in_use_by: number
  }>
  enabled: boolean
  revision: string
  created_at: string
  updated_at: string
}
```

当前 client 解析 Hub `data` envelope；secret value 不在 response view 中。没有独立 custom API list/update/delete 路由接线。

#### Connector icon asset

```http
POST /api/hub/self/connectors/assets
Content-Type: multipart/form-data
file=<browser File>
```

成功 data：

```json
{"asset_id":"ASSET_ID","url":"ASSET_URL"}
```

### 7.7 Skills UI 与详情边界

- `/app/skills` 是前端 route surface，不是 `/api/skills`。
- catalog detail 仅使用 `SkillCard/SkillCatalogCard` 摘要；没有 detail/content/files API。
- Skill detail dialog 展示的 YAML 与 `references/SKILL.md` file tree 是 UI 生成的 presentation，不是后端读取结果。
- “Try” 会关闭 settings、开启新的 direct Chat、pin skill 并写入本地 draft；真正发送时才进入 Chat `pinned_skills`。
- Hub query/cache 是模块级内存 cache；stale data 只用于 UI loading/error 期间展示，不等同 HTTP cache 或持久化。

## 8. Library / artifacts

### 8.1 Live artifacts list

Library 复用 SessionClient，真实列表路径：

```http
GET /api/session/artifacts
GET /api/session/artifacts?cursor=CURSOR
```

```ts
type ArtifactRecord = {
  content_hash: string
  session_id: string
  title: string
  mime: string
  size: number
  created_at: string
}

type ArtifactList = {
  artifacts: ArtifactRecord[]
  next_cursor?: string
}
```

响应是 flat JSON，不是 Hub `data` envelope。列表是当前属主 namespace 的跨会话聚合；cursor 由 server 解释，client 只 URL encode。UI 按 `content_hash` 合并分页结果，并对重复 cursor 停止继续加载。

### 8.2 Live content/download

```http
GET /api/session/artifacts/{encoded_content_hash}
```

Library 默认通过 authenticated fetch 取得 blob，再以 artifact title 下载；该响应是文件 body，不解析为 JSON。Session BFF 保留 content type、content disposition、content length 并流式传递。

Canvas 另外使用：

```http
GET /api/session/sessions/{session_id}/files/{path}
GET /api/session/sessions/{session_id}/deliveries/{encoded_content_hash}
```

这两个路径只读取 Session snapshot 声明的 workspace file/delivery，不构成新的 library API。

### 8.3 Preview 与 UI 状态

- 当前 local/test 的 `fixtureMode = preview || NODE_ENV !== "production"`。
- 未注入 `artifactClient` 或 `fixtureArtifacts` 时，preview session client 的 `listArtifacts` 返回 `{artifacts: []}`，preview 下载在浏览器内生成本地 Blob。
- 显式 `fixtureArtifacts` 是测试/视觉 fixture seam；不发送 live request。
- 注入了 `artifactClient` 时保留该 client 的 live/error 语义。
- Library 的 `type`、`q`、`view`、`favorites=1` 是 URL state；favorites 没有后端 mutation。
- `/api/dev/preview-files/preview-delivery-report` 仅服务非 production 的单一 Canvas preview delivery 文件，不是通用 artifact download endpoint。

## 9. Scheduled

### 9.1 独立 Scheduled surface 的真实 adapter contract

`src/features/app/kokoro-scheduled-surface.tsx` 只定义窄 adapter，不创建第二个 fetch client：

```ts
type ScheduledTaskRecord = {
  id: string
  title: string
  prompt?: string
  frequency: "daily" | "weekly"
  time: string
  timezone?: string
  nextRun?: string
  expiresAt?: string
  autoApprove?: boolean
  enabled?: boolean
  status?: "active" | "paused" | "failed"
}

type ScheduledTaskDraft = {
  title: string
  prompt: string
  frequency: "daily" | "weekly"
  time: string
  timezone: string
  expiresAt?: string
  autoApprove: boolean
}

type ScheduledTaskPatch = Partial<Pick<
  ScheduledTaskRecord,
  "title" | "prompt" | "frequency" | "time" | "timezone" |
  "expiresAt" | "autoApprove" | "enabled" | "status"
>>

type ScheduledTaskClient = {
  listScheduledTasks: () => Promise<readonly ScheduledTaskRecord[]>
  createScheduledTask?: (draft: ScheduledTaskDraft) => Promise<unknown>
  updateScheduledTask?: (taskId: string, patch: ScheduledTaskPatch) => Promise<unknown>
  retryScheduledTask?: (taskId: string) => Promise<unknown>
  deleteScheduledTask?: (taskId: string) => Promise<unknown>
}
```

这组 type 是 UI injection contract，不是已注册 HTTP schema；`unknown` 回执不会被 surface 解析为 canonical response。

### 9.2 Preview closed（独立 surface 的 Preview 闭环）

只有 `preview=true` 时，独立 surface 才使用 local fixture：

- key：`kokoro.preview.scheduled-tasks`
- storage：`localStorage`
- 新建 ID：`scheduled_preview_N`
- `nextRun` 由浏览器当前时间、daily/weekly 与 `time` 计算
- create/update/retry/delete 直接更新 localStorage/React state
- `?tab=calendar|list` 与 `#scheduled-tasks/new` 仅是前端 URL state
- timezone 由 `Intl.DateTimeFormat().resolvedOptions().timeZone` 推导，失败时为 `UTC`
- editor 要求非空 title/prompt；expires 开启时要求 expiry date；autoApprove 是 boolean

### 9.3 Live 当前边界（独立 surface 的 Live not closed）

AppSurface 没有注入 `ScheduledTaskClient`。live 且没有 controlled `tasks` 时，surface 试图调用 adapter；adapter 缺失会显示 load error，动作保持不可用。当前 `src/app/api` 没有独立 scheduled list/update/retry/delete route，也没有 `ScheduledTaskClient` 的 HTTP 实现。因此不定义 `/api/scheduled-tasks*`。

### 9.4 已存在的 project create 兼容调用

Project workspace 的 AppFrame 另有一条真实 direct fetch，只覆盖 create：

```http
POST /api/hub/projects/{project_ref}/scheduled-tasks
Content-Type: application/json
```

当前 body 由 `AppFrame` 直接序列化：

```ts
{
  title: string
  prompt: string
  frequency: string
  time: string
  expiresAt?: string
  autoApprove: boolean
}
```

这是 `/api/hub/[...path]` catch-all 到 Hub `/hub/projects/{project_ref}/scheduled-tasks` 的兼容路径；调用方只检查 `response.ok`，没有 response schema、list/update/retry/delete 接口，也没有 preview 分支。它不应被扩写成通用 scheduled API；project_ref 是 route ownership reference，不是 tenant selector。

## 10. Capsule / creation intent

Capsule 是 Composer 的本地模式选择，不是 API resource。

### 10.1 值域与存储

```ts
type CreationIntent = "presentation" | "website" | "design" | "game" | "app"
```

- React shell state：AppFrame 的 `deploymentIntent`
- session storage key：`kokoro.web.pending-creation-intent`
- 旧 localStorage 同名 key 会被清理；不会跨 tab 作为服务端状态传播
- 非 production 且 URL `?qa=capsule-final` 时，本地 screenshot fixture 初始为 `website`
- production 不识别该 QA fixture
- project workspace 会清掉 direct-chat capsule intent

### 10.2 交互到 Chat 的边界

- 选择 capsule：保留空 draft，设置本地 intent，更新 UI placeholder/model presentation；不发 API。
- dismiss：清除 React state 与 sessionStorage，保留 draft。
- preset prompt：设置 intent 并写入本地 draft。
- 用户真正提交时只调用 `engine.submit(content)`，最终进入 Chat 的 `POST /api/session/sessions/{session_id}/messages`。
- `creationIntent` 不存在于 `messageCreateParams`，也不作为 query/header/body 字段发送。
- capsule 不创建 project、artifact、scheduled task 或独立 backend record。

因此当前契约不添加 `/api/capsules`、`/api/creation` 或 creation intent 字段。

## 11. 错误、缓存与回退规则

### 11.1 BFF 层错误

| BFF | 条件 | 响应 |
|---|---|---|
| Session | auth config 缺失 | 503 `auth_not_configured` |
| Session | cookie envelope 缺失/失效 | 401 `unauthenticated` |
| Session/Hub | mutation Origin 不匹配 | 403 `forbidden_origin` |
| Session | session upstream 不可达 | 502 `session_unreachable` |
| Hub | hub base 缺失 | 503 `hub_not_configured` |
| Hub | hub upstream 不可达 | 502 `hub_unreachable` |
| Manifest | system/domain 或生产认证配置缺失 | 503 `system_runtime_unavailable` |

BFF 自身错误使用 flat `{"error": string}`；upstream 的 body/status 原样或按对应 client contract 处理，两种 envelope 保持分离。

### 11.2 Client 层错误

- Session：`network | http | parse`
- Hub：`network | http | parse | aborted`
- Agent：`AgentClientError`，带 `status: number | null`
- Manifest hook：`source="error"`
- Scheduled live：`loadError/mutationError`
- Library live：显示 load error；只有显式 preview transport 才可呈现空列表

### 11.3 Cache / stale

- Session、Hub、manifest、artifact live fetch 均使用 `no-store` 或 BFF private no-store。
- `src/lib/query` 的 stale/in-flight dedupe 是客户端内存行为，不改变 API cache-control。
- stale data 可在刷新或 error 期间继续展示，但不表示新的 server write 已成功。
- schema parse 失败保持可见错误，不折叠为空数组。

## 12. 当前闭环矩阵

| Surface | 浏览器入口 | 当前真实接口/本地来源 | Preview | Live | 本版结论 |
|---|---|---|---|---|---|
| Chat | `/app`、`/app/project/{ref}` | `/api/session/*` catch-all + SessionClient/SSE | closed | conditional on auth/session | 已冻结 |
| Agent | `/app/agents` | preview client；live client target 无 app route | Preview closed | Live not closed | 独立页面/Preview setup 已闭环；Live route 未注册 |
| Skills | `/app/skills`、settings Skills | `/api/hub/self/skills/*` | closed | conditional on hub | 已冻结 |
| MCP/connectors | settings / skills-adjacent | `/api/hub/self/mcp/*`、`/connectors/*` | closed | conditional on hub | 已冻结 |
| Library | `/app/library` | `/api/session/artifacts*` | empty/download fixture | conditional on session | 已冻结 |
| Scheduled | `/app/scheduled` | preview localStorage；project create 的 Hub catch-all | Preview closed | Live not closed；project create only | 独立页面 Preview CRUD 已闭环；不定义通用 scheduled route |
| Capsule | Composer | React + sessionStorage | closed | local only | 不定义 API |
| Manifest | AppGate | preview constant；`/api/system/runtime-manifest` | closed | conditional on System | 已冻结 |

## 13. 实现核对索引

本版契约对应的本地实现入口：

- 路由：`src/app/api/session/[...path]/route.ts`、`src/app/api/hub/[...path]/route.ts`、`src/app/api/settings/[...path]/route.ts`、`src/app/api/mail/[...path]/route.ts`、`src/app/api/system/runtime-manifest/route.ts`
- Chat types/client：`src/contract/http.ts`、`src/contract/control.ts`、`src/contract/session-events.ts`、`src/engine/client.ts`、`src/engine/machine.ts`
- Preview Chat：`src/dev/preview-transport.ts`
- Agent：`src/agents/client.ts`、`src/agents/preview-client.ts`
- Hub/Skills/MCP：`src/hub/schemas.ts`、`src/hub/client.ts`、`src/dev/preview-clients.ts`
- Library：`src/features/app/kokoro-library-surface.tsx`
- Scheduled：`src/features/app/kokoro-scheduled-surface.tsx`、`src/features/app/scheduled-task-editor.tsx`、`src/components/blocks/app-frame/app-frame.tsx`
- Capsule：`src/ui/composer/creation-intent-pill.tsx`、`src/components/blocks/app-frame/app-frame.tsx`
- Manifest：`src/system/runtime-manifest.ts`、`src/system/preview-runtime.ts`、`src/system/use-runtime-manifest.ts`
- 身份/domain：`src/lib/server/auth.ts`、`src/lib/server/domain-context.ts`、`src/lib/server/upstream-http.ts`
- 环境说明：`docs/deployment.md`、`.env.local.example`、`.env.test.example`、`.env.prod.example`、`.env.production.example`

本文件只描述当前 kokoro 子仓库能从上述实现闭环验证的接口；matrix 中尚未注册的 canonical route、跨仓 backend 假设和未接线的 client type 不在本版契约中。
