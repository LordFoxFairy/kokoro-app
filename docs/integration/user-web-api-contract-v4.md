# Kokoro User Web API Contract v4

状态：2026-08-31 起作为 User Web 与后端 Agent 的集成基线。v3 中已经实现的会话事件、计费、
Team、Runtime Manifest，以及 Skills/MCP 的 compatibility transport 继续有效；本文件统一 canonical
surface、当前接入状态和后续 Client/Fixture 的形状。Compatibility transport 不等于 canonical
endpoint 已上线，具体状态以 3.8 为准。

## 1. 边界

1. 浏览器只访问当前域名的同源 `/api/*` BFF，不保存服务 token。
2. 浏览器不提交或接收可信 `tenant_id`、`site_id`、IAM token、workload token。
3. BFF 读取服务端 `KOKORO_DOMAIN` 并生成 RFC 7239 `Forwarded`；后端按 `Forwarded -> httpOnly session ->
   membership -> capability` 解析上下文。浏览器伪造的 RFC 7239 `Forwarded`、Host 或 tenant/site 字段均被忽略。
4. `project_id`、`task_id`、`team_id` 等只是 tenant 内不透明资源 ID，不能作为租户证明。
5. 跨租户资源统一返回 `404 resource.not_found`，不泄露资源是否存在。
6. 所有 mutation 接收 `Idempotency-Key`；创建类操作返回 receipt，耗时操作返回 operation。

### 1.1 Transport authority（强制）

- 浏览器 **不得发送 `X-Domain`**。它不是本契约的请求字段；即使浏览器或扩展注入该 header，BFF
  也必须忽略、删除且不得转发。
- `KOKORO_DOMAIN` 仅是服务端部署配置。浏览器不得从 query、body、header、runtime manifest、
  localStorage 或 Cookie 读取、设置、选择或回传该值。
- BFF 到每个 User/Session/System/Hub/Billing/Share 上游只生成一个标准 RFC 7239
  `Forwarded: host=<KOKORO_DOMAIN>`，覆盖调用方同名值；HTTP `Host` 只表示上游目标连接 authority，
  不表示产品租户或站点上下文。
- 后端必须先验证 Web BFF 的 service auth 和来源 allowlist（例如内部 secret/mTLS、网络 ACL 或等价
  机制），再信任 `Forwarded` 做 domain allowlist、deployment binding 和 tenant resolution；
  `Forwarded` 自身不是认证凭据。

细则见 [`forwarded-context-contract-v1.md`](forwarded-context-contract-v1.md)。

### 1.2 环境与发布单元边界

三个文档对环境采用同一组约定：

| 环境 | 配置入口 | `KOKORO_DOMAIN` 示例 | Mock/Preview | `NODE_ENV` |
| --- | --- | --- | --- | --- |
| local | `.env.local` | `dev.kokoro.localhost` | 可用；由 `NEXT_PUBLIC_SESSION_PREVIEW=1` 显式开启 | `development` |
| test | `.env.test` | `test.kokoro.localhost` | 可用；测试可按用例注入隔离值 | `test` |
| prod | `.env.prod`（Docker 显式加载）或 `.env.production`/平台运行时 | 部署绑定的公开 hostname | 不使用；生产代码路径不启用 Preview Client | `production` |

`alpha.fixture.test` 与 `beta.fixture.test` 仅是测试用的 deployment binding，不是额外的生产环境文件或浏览器可选域名。
`LordFoxFairy/kokoro-app` 是独立的 Web 发布仓库，根 package 为 `@kokoro/app`；mock/preview fixture 与页面代码同属该仓库（本地 checkout 目录为 `kokoro`），
不因功能拆出新的 Git 仓库，也不把仓库名作为 API 字段。具体加载优先级与部署命令见 [`../deployment.md`](../deployment.md)。

## 2. 通用信封

```ts
type ApiSuccess<T> = { ok: true; request_id: string; data: T }
type ApiPage<T> = ApiSuccess<T[]> & { has_more: boolean; next_cursor: string | null }
type ApiFailure = {
  ok: false
  request_id: string
  error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> }
}
type Operation = {
  id: string
  status: "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled"
  resource_id?: string
  created_at: string
  updated_at: string
}
```

最低错误集：`auth.required`、`auth.forbidden`、`resource.not_found`、`request.invalid`、
`capability.disabled`、`idempotency.conflict`、`rate_limited`、`operation.conflict`、
`operation.failed`、`credit.insufficient`、`upload.expired`、`upload.rejected`、
`upload.media_type_unsupported`、`upload.too_large`、`connector.name_conflict`、
`connector.endpoint_unreachable`、`connector.import_invalid`、`secret.in_use`。

字段校验错误使用稳定字段路径，UI 不解析错误文案：

```ts
type ValidationDetails = {
  fields: Array<{
    path: string
    code: "required" | "invalid" | "duplicate" | "unsupported" | "too_large"
    message: string
  }>
}
```

## 3. Surface 与路径

### 3.1 启动、账户和偏好（System + IAM/User Profile）

| Method | BFF path | 用途 |
| --- | --- | --- |
| GET | `/api/system/runtime-manifest` | 站点皮肤、品牌、导航、能力和 locale projection |
| GET/PATCH | `/api/settings/account` | 账户 projection / 更新展示信息 |
| GET/PATCH | `/api/settings/preferences` | 语言、主题、通知和广告偏好 |
| GET | `/api/settings/login-methods` | 登录方式和 passkey 状态 |
| POST/DELETE | `/api/settings/login-methods/{provider}` | 绑定或解除登录方式 |
| POST | `/api/settings/account/deletion` | 创建账户删除 operation |

### 3.2 Project、Task、会话和成果（Session/Project）

| Method | BFF path | 用途 |
| --- | --- | --- |
| GET/POST | `/api/projects` | 项目列表 / 创建项目 |
| GET/PATCH/DELETE | `/api/projects/{project_id}` | 项目详情、指令和生命周期 |
| GET/POST/DELETE | `/api/projects/{project_id}/resources` | 项目资源目录、上传和删除 |
| GET/PUT | `/api/projects/{project_id}/skills` | 项目技能绑定 projection / 替换 |
| GET/POST | `/api/projects/{project_id}/scheduled-tasks` | 排程列表 / 创建 |
| GET/POST | `/api/scheduled-tasks` | 当前用户跨项目排程日历 / 创建 direct scope 排程 |
| GET/PATCH/DELETE | `/api/scheduled-tasks/{scheduled_task_id}` | 排程详情、暂停/恢复、编辑和删除 |
| GET/POST | `/api/tasks` | direct/project scoped 任务列表 / 创建 |
| GET/PATCH/DELETE | `/api/tasks/{task_id}` | 任务状态、重命名和删除 |
| POST | `/api/tasks/{task_id}/messages` | 继续多轮任务 |
| POST | `/api/tasks/{task_id}/cancel` | 取消当前 run |
| GET | `/api/tasks/{task_id}/events` | SSE 事件流，支持 `Last-Event-ID` |
| GET | `/api/tasks/{task_id}/artifacts` | 成果目录 |
| POST/DELETE | `/api/tasks/{task_id}/share` | 创建 / 撤销只读分享 |

Task 的 scope 仅为 `direct` 或 `project`；project task 必须携带 `project_id`。项目不是会话，
一个项目内允许多个任务。

排程页面是独立一级资源，不从浏览器接收 `tenant_id`。`GET /api/scheduled-tasks` 支持
`tab=calendar|list`、`cursor`、`limit`、`status=active|paused|failed`；后端按 RFC 7239 `Forwarded` 解析 tenant，按
httpOnly session 解析 actor，并只返回该 actor 在当前 tenant 可见的排程。项目内创建可以继续使用
`/api/projects/{project_id}/scheduled-tasks`；两条创建路径返回同一种 projection：

```ts
type ScheduledTask = {
  id: string
  title: string
  prompt: string
  scope: "direct" | "project"
  project_id: string | null
  schedule: { frequency: "daily" | "weekly"; time: string; timezone: string; expires_at: string | null }
  auto_approve: boolean
  status: "active" | "paused" | "failed"
  next_run_at: string | null
  last_run_at: string | null
  revision: number
  created_at: string
  updated_at: string
}

type ScheduledTaskCreate = {
  title: string
  prompt: string
  frequency: "daily" | "weekly"
  time: string
  timezone: string
  expires_at?: string
  auto_approve: boolean
  project_id?: string
}
```

`POST` 必须携带 `Idempotency-Key`。`timezone` 由浏览器提交 IANA 名称并由服务端校验；禁止仅保存浏览器
UTC offset。跨 tenant 的 `project_id` 与 `scheduled_task_id` 均返回统一 `404 resource.not_found`。

### 3.3 Composer、Skills、Connectors 和 MCP（Hub）

| Method | BFF path | 用途 |
| --- | --- | --- |
| GET | `/api/composer/catalog?project_id=...` | 模型、Agent、模式、技能与连接器 projection |
| GET/PATCH | `/api/skills`、`/api/skills/{name}` | 技能目录、启停和修订 |
| GET | `/api/connectors/catalog` | 可安装连接器，支持 cursor/filter |
| GET | `/api/connectors/catalog/{connector_id}` | 连接器详情和安装动作 projection |
| GET | `/api/connectors/installations` | 当前安装及授权状态 |
| POST | `/api/connectors/{connector_id}/authorize` | 创建 OAuth/授权 handoff |
| DELETE | `/api/connectors/installations/{installation_id}` | 解除连接 |
| GET/POST | `/api/connectors/custom-apis` | 自订 API 列表 / 创建 |
| GET/PATCH/DELETE | `/api/connectors/custom-apis/{connector_id}` | 自订 API 详情 / 更新 / 删除 |
| POST | `/api/connectors/assets/validate` | 图示上传预检并签发短时 upload receipt |
| POST | `/api/connectors/assets/{upload_id}/complete` | 完成上传并取得可引用 asset |
| GET/POST | `/api/mcp/servers` | MCP server 列表 / 创建 |
| PATCH/DELETE | `/api/mcp/servers/{server_id}` | 启停、更新和删除 |
| GET/POST | `/api/mcp/secrets` | Secret entry 列表 / 创建；值只写不回显 |
| DELETE | `/api/mcp/secrets/{secret_id}` | 删除未被连接器引用的 secret entry |
| POST | `/api/mcp/imports/json/validate` | 校验 JSON 并返回规范化草稿 |
| POST | `/api/mcp/imports/json/confirm` | 根据已校验草稿创建 MCP |
| POST | `/api/mcp/imports/url/inspect` | SSRF-safe URL 探测并返回草稿 |
| POST | `/api/mcp/imports/url/confirm` | 根据 URL 探测结果创建 MCP |

### 3.4 Billing、Team 与数据管理（Billing + IAM + User Data）

保留现有 typed client 路径，并统一到通用信封：`/api/billing/summary`、`/plans`、`/checkout`、
`/ledger`、`/usage`；`/api/team/*`；`/api/settings/data-management/*`。同邮箱在不同 tenant
下形成独立 membership，Team 切换不能改变 RFC 7239 `Forwarded` 解析出的 tenant。

### 3.5 Mail、Computer、Deployment 和 Integrations（Hub + Execution）

| Method | BFF path | 用途 |
| --- | --- | --- |
| GET/POST | `/api/mail/workflows` | Mail 工作流列表 / 创建 |
| DELETE | `/api/mail/workflows/{workflow_id}` | 删除工作流 |
| GET/POST | `/api/mail/senders` | 授权发件人列表 / 创建 |
| DELETE | `/api/mail/senders/{sender_id}` | 删除授权发件人 |
| GET | `/api/mail/inbox?cursor=&limit=50` | 任务邮箱收件记录；按 `received_at desc, id desc` 稳定排序 |
| GET/POST | `/api/computers` | 云电脑列表 / 创建 operation |
| GET/DELETE | `/api/computers/{computer_id}` | 状态 / 停止并删除 |
| GET | `/api/computers/plans` | 可用方案 projection |
| GET/POST | `/api/deployments` | 部署列表 / 创建 operation |
| GET/POST | `/api/domains` | 域名列表 / 创建购买或绑定 operation |
| GET | `/api/integrations/catalog` | 整合目录 |
| GET/POST | `/api/integrations/installations` | 已安装列表 / 创建授权 handoff |
| DELETE | `/api/integrations/installations/{installation_id}` | 解除整合 |

Mail 收件匣返回通用分页信封，浏览器不接收原始邮件正文或附件密钥：

```ts
type MailInboxItem = {
  id: string
  sender: string
  subject: string
  received_at: string
}
type MailInboxPage = ApiPage<MailInboxItem>
```

`sender` 是当前 tenant 可展示的已规范化地址，`subject` 为空时返回空字符串；未命中记录返回
`200` 与空 `data/items`，不使用 `404`。刷新操作重复 GET，不创建 operation。工作流邮箱与授权
发件人的 POST 必须携带 `Idempotency-Key`。

### 3.6 Developer（Developer Platform）

| Method | BFF path | 用途 |
| --- | --- | --- |
| GET/POST | `/api/settings/developer/api-keys` | API key 列表 / 创建 |
| PATCH/DELETE | `/api/settings/developer/api-keys/{key_id}` | 重命名、撤销 |
| POST | `/api/settings/developer/api-keys/{key_id}/rotate` | 轮换 secret |
| GET/POST | `/api/settings/developer/webhooks` | Webhook 列表 / 创建 |
| PATCH/DELETE | `/api/settings/developer/webhooks/{webhook_id}` | 更新、暂停和删除 |
| POST | `/api/settings/developer/webhooks/{webhook_id}/rotate-secret` | 轮换签名密钥 |

API key 与 webhook secret 仅在创建或轮换成功时返回一次。列表只返回 prefix、状态、scope、
创建时间和最后使用时间。Webhook delivery 需要稳定 `event_id`、签名时间戳、重试次数和
幂等消费语义。

### 3.7 Canonical path 与兼容路径

本节 3.1–3.6 的 `/api/*` 表是最终 User Web 的 canonical BFF 契约。当前仓库仍有两类兼容实现：
`/api/session/*` 承载既有会话/成果 transport，`/api/hub/*`（包括 `/api/hub/self/*`）承载既有
Skills、MCP、Connector 和部分设置 transport。兼容路径不能被当作第二套浏览器契约；新 Client、
fixture 和 integration test 只能引用 canonical path，除非明确标注为 compatibility alias。

若 canonical path 尚无对应 BFF route，状态应记录为“契约已定义、服务端接入缺失”，不得用 preview
client 或静态数据宣称已实现；alias 与 canonical path 也必须共享同一 envelope、幂等、service auth/
allowlist、`Forwarded` 和 scope 规则。

### 3.8 当前 BFF 接入状态（2026-08-31）

本表是本仓库的事实状态，不把契约文档、preview client 或上游 Hub 能力误记为已上线的
canonical BFF。后端 Agent 接入时以 3.1–3.6 的路径为唯一新 Client 目标；兼容路径只用于迁移和
回归验证。

| Surface | Canonical BFF | 当前仓库状态 | 现有兼容/预览来源 |
| --- | --- | --- | --- |
| Runtime Manifest | `/api/system/runtime-manifest` | 已有 route | 无 |
| Settings | `/api/settings/*` | 有 catch-all，当前转发 Hub，需逐项 contract hardening | `/api/hub/settings/*` |
| Projects | `/api/projects*` | route 尚未接入 | `/api/hub/projects/*` |
| Tasks | `/api/tasks*` | route 尚未接入 | `/api/session/sessions/*` |
| Scheduled tasks | `/api/scheduled-tasks*` | route 尚未接入；预览页可使用 fixture/localStorage | project Hub 路径 / preview fixture |
| Skills | `/api/skills*` | route 尚未接入 | `/api/hub/self/skills/*` |
| Connectors | `/api/connectors*` | route 尚未接入 | `/api/hub/self/connectors/*` |
| MCP | `/api/mcp*` | route 尚未接入 | `/api/hub/self/mcp/*` |

“route 尚未接入”是待实现状态，不是失败响应契约。实现顺序应先建立统一 BFF context、envelope、
idempotency 和 error mapping，再逐组把 compatibility client 迁移到 canonical path；在迁移完成前，
前端不得以静态数据或 preview 成功态掩盖 live BFF 的 `401/403/404/409/503`。

## 4. 缓存和异步

- Runtime Manifest：`ETag` + `stale-while-revalidate`，服务端 domain/tenant/locale/surface 隔离。
- Connector catalog/detail：`Cache-Control: private, max-age=30, stale-while-revalidate=30` + `ETag`；
  cache key 必须包含服务端解析的 tenant、domain binding revision、locale、category、query 和 cursor。
- Connector installation、Custom API、MCP server、secret entry：`private, no-store`。任一 connector mutation
  成功后使当前 tenant/actor 的 catalog detail、installation、composer catalog 和 project binding query 失效。
- Account、Team、API key、Webhook：`private, no-store`。
- Task、deployment、computer、domain operation：创建后先返回 `202 Operation`，UI 通过 SSE
  或带退避的 GET 刷新；刷新页面后必须可以恢复。
- GET 的 loading 由客户端保留旧 projection 并显示局部 skeleton；空集合必须返回 `200` 和空数组，
  不用 `404` 表示 empty。网络错误不得回退到另一 tenant 或静态 populated fixture。

## 5. 后端 Agent 验收

1. 每条路径具备 success、empty、validation、unauthorized、forbidden、not-found、rate-limit fixture。
2. BFF 删除浏览器注入的内部身份头，并在服务端重新注入 tenant context。
3. mutation 验证幂等重放与 conflict。
4. 列表验证稳定 cursor；删除后旧 cursor 不跨 tenant 泄露。
5. TypeScript client、Zod schema、fixture 和 HTTP integration test 使用同一资源模型。

## 6. Integration 资源模型

整合列表与详情只消费后端 projection，不把第三方 OAuth token、refresh token 或 provider
账户内部 ID 暴露给浏览器。目录内容允许由 System/Hub 配置扩展，但 `id` 在 tenant 内稳定。

```ts
type IntegrationCatalogItem = {
  id: string
  slug: string
  name: string
  title: string
  description: string
  icon_url: string | null
  category: "automation" | "messaging" | "productivity" | "data" | "other"
  capabilities: string[]
  enabled: boolean
  detail: {
    overview: string | null
    documentation_url: string | null
    templates: Array<{
      id: string
      title: string
      subtitle: string
      app_icons: Array<{ name: string; icon_url: string | null }>
      launch_url: string | null
    }>
  }
}

type IntegrationInstallation = {
  id: string
  integration_id: string
  status: "authorizing" | "connected" | "paused" | "error"
  display_account: string | null
  scopes: string[]
  connected_at: string | null
  updated_at: string
  revision: string
}

type AuthorizationHandoff = {
  operation: Operation
  authorization_url: string
  expires_at: string
}
```

接口细则：

| Method | Path | Request / response |
| --- | --- | --- |
| GET | `/api/integrations/catalog` | `ApiPage<IntegrationCatalogItem>`；支持 `cursor/category/query` |
| GET | `/api/integrations/installations` | `ApiPage<IntegrationInstallation>` |
| POST | `/api/integrations/installations` | `{ integration_id, return_to } -> AuthorizationHandoff` |
| PATCH | `/api/integrations/installations/{id}` | `{ enabled, revision } -> ApiSuccess<IntegrationInstallation>` |
| DELETE | `/api/integrations/installations/{id}` | `204`；服务端同步撤销 provider grant |
| GET | `/api/operations/{operation_id}` | 授权回跳后恢复 `authorizing -> connected/error` 状态 |

固定 fixture ID：`integration_zapier`、`integration_slack`、`integration_telegram`、
`integration_line`。必须覆盖 catalog populated/empty、connected、authorizing、paused、provider
error、capability disabled、revision conflict 和 revoke failure；fixture 只使用测试账户与不透明
ID，不复制线上用户或第三方凭据。

## 7. Connector 统一资源模型

Connector 是目录、安装和自订能力的统一 projection。`kind` 决定配置面，不决定 tenant；所有资源
仍由经 service auth/allowlist 校验的 `Forwarded` + session 服务端上下文限定。目录项不包含 OAuth client secret、provider account ID、
MCP header value 或 Custom API secret value。

```ts
type ConnectorKind = "app" | "custom_api" | "custom_mcp"
type ConnectorStatus = "available" | "authorizing" | "connected" | "disabled" | "error"

type ConnectorSummary = {
  id: string
  slug: string
  kind: ConnectorKind
  name: string
  description: string
  icon_url: string | null
  category: string
  status: ConnectorStatus
  installed: boolean
  capabilities: string[]
  badges: Array<"beta" | "official" | "project_only">
  updated_at: string
}

type ConnectorDetail = ConnectorSummary & {
  overview: string | null
  documentation_url: string | null
  installation: {
    id: string
    display_account: string | null
    scopes: string[]
    connected_at: string | null
    last_error: { code: string; message: string } | null
  } | null
  actions: Array<"authorize" | "configure" | "enable" | "disable" | "delete">
  revision: string
}
```

```http
GET /api/connectors/catalog?kind=app&category=productivity&query=calendar&limit=40

200
{
  "ok": true,
  "request_id": "req_fixture_catalog_01",
  "data": [{
    "id": "connector_calendar_fixture",
    "slug": "calendar-fixture",
    "kind": "app",
    "name": "Calendar Fixture",
    "description": "Manage fixture schedules",
    "icon_url": "/assets/connectors/calendar-fixture.webp",
    "category": "productivity",
    "status": "available",
    "installed": false,
    "capabilities": ["calendar.read", "calendar.write"],
    "badges": ["official"],
    "updated_at": "2026-08-29T12:00:00Z"
  }],
  "has_more": false,
  "next_cursor": null
}
```

`GET /api/connectors/catalog/{connector_id}` 返回 `ApiSuccess<ConnectorDetail>`。未知、其他 tenant
或当前 actor 不可见的 ID 都返回相同的 `404 resource.not_found`。

## 8. Custom API 与 Secret Entries

### 8.1 Wire types

```ts
type SecretWrite = { name: string; value: string }
type SecretEntry = {
  id: string
  name: string
  created_at: string
  updated_at: string
  in_use_by: number
}

type CustomApi = {
  id: string
  kind: "custom_api"
  name: string
  notes: string | null
  icon_url: string | null
  secret_entries: SecretEntry[]
  enabled: boolean
  revision: string
  created_at: string
  updated_at: string
}

type CustomApiCreate = {
  name: string
  notes: string | null
  icon_asset_id: string | null
  secrets: SecretWrite[]
  enabled: boolean
}

type CustomApiUpdate = {
  name?: string
  notes?: string | null
  icon_asset_id?: string | null
  enabled?: boolean
  revision: string
  secret_changes?: Array<
    | { op: "create"; name: string; value: string }
    | { op: "replace"; secret_id: string; value: string }
    | { op: "delete"; secret_id: string }
  >
}
```

`value` 只允许出现在 create/replace 请求体，任何成功响应、列表、详情、日志、错误 details、审计 diff
和 fixture snapshot 都不得包含该值。Secret 创建成功只返回 `SecretEntry` 元数据，不返回 secret value。

### 8.2 CRUD

| Method | Path | Request / response |
| --- | --- | --- |
| GET | `/api/connectors/custom-apis` | `ApiPage<CustomApi>`；支持 `cursor/query` |
| POST | `/api/connectors/custom-apis` | `CustomApiCreate -> ApiSuccess<CustomApi>` |
| GET | `/api/connectors/custom-apis/{id}` | `ApiSuccess<CustomApi>` |
| PATCH | `/api/connectors/custom-apis/{id}` | `CustomApiUpdate -> ApiSuccess<CustomApi>` |
| DELETE | `/api/connectors/custom-apis/{id}` | `ApiSuccess<{ deleted: true }>` |
| GET | `/api/mcp/secrets` | `ApiPage<SecretEntry>` |
| POST | `/api/mcp/secrets` | `SecretWrite -> ApiSuccess<SecretEntry>` |
| DELETE | `/api/mcp/secrets/{id}` | `ApiSuccess<{ deleted: true }>` |

POST、PATCH、DELETE 必须携带 `Idempotency-Key`。同一 actor、tenant、route、key 和规范化 body
重放返回第一次的相同 status/body；同 key 不同 body 返回 `409 idempotency.conflict`。PATCH 使用
`revision` 乐观并发；旧 revision 返回 `409 resource.version_conflict` 和最新安全 projection。
被 Connector/MCP 引用的 secret 删除返回 `409 secret.in_use`，details 只能给引用数量，不能泄露
其他资源名称。

```http
POST /api/connectors/custom-apis
Idempotency-Key: fixture-custom-api-001
Content-Type: application/json

{
  "name": "Search API Fixture",
  "notes": "Fixture-only search connector",
  "icon_asset_id": "asset_fixture_search",
  "secrets": [{ "name": "SEARCH_API_KEY", "value": "fixture-secret-write-only" }],
  "enabled": true
}

201
{
  "ok": true,
  "request_id": "req_fixture_custom_api_01",
  "data": {
    "id": "connector_custom_api_fixture_01",
    "kind": "custom_api",
    "name": "Search API Fixture",
    "notes": "Fixture-only search connector",
    "icon_url": "/assets/connectors/custom-api-fixture.png",
    "secret_entries": [{
      "id": "secret_fixture_01",
      "name": "SEARCH_API_KEY",
      "created_at": "2026-08-29T12:00:00Z",
      "updated_at": "2026-08-29T12:00:00Z",
      "in_use_by": 1
    }],
    "enabled": true,
    "revision": "rev_fixture_01",
    "created_at": "2026-08-29T12:00:00Z",
    "updated_at": "2026-08-29T12:00:00Z"
  }
}
```

## 9. Connector Asset Upload Validation

上传图示采用 validate -> binary upload -> complete 三段式，不允许浏览器把任意 URL 当成资产。初版只允许
PNG/JPEG、最大 1 MiB；服务端按实际 magic bytes 校验，拒绝 SVG、动画、多段文件和扩展名伪装。

```ts
type AssetValidateRequest = {
  file_name: string
  media_type: "image/png" | "image/jpeg"
  size_bytes: number
  sha256: string
}
type AssetUploadReceipt = {
  upload_id: string
  upload_url: string
  upload_method: "PUT"
  upload_headers: Record<string, string>
  expires_at: string
  max_bytes: number
}
type ConnectorAsset = {
  asset_id: string
  url: string
  media_type: "image/png" | "image/jpeg"
  width: number
  height: number
}
```

`POST /api/connectors/assets/validate` 返回 `ApiSuccess<AssetUploadReceipt>`；完成对象上传后，
`POST /api/connectors/assets/{upload_id}/complete` 携带 `{ sha256 }`，返回
`ApiSuccess<ConnectorAsset>`。upload receipt 最长 10 分钟，只允许指定 method、content type、长度和
对象 key；complete 必须重新验证 hash、magic bytes 和 tenant/actor ownership。失败使用
`upload.expired`、`upload.too_large`、`upload.media_type_unsupported` 或 `upload.rejected`。

## 10. Custom MCP、JSON Import 与 URL MCP

### 10.1 Custom MCP

```ts
type HeaderWrite = { name: string; value: string }
type CustomMcpCreate = {
  name: string
  transport: "http" | "streamable_http"
  endpoint_url: string
  icon_asset_id: string | null
  instructions: string | null
  headers: HeaderWrite[]
  enabled: boolean
}
type McpServer = {
  id: string
  name: string
  transport: "http" | "streamable_http"
  endpoint_url: string
  icon_url: string | null
  instructions: string | null
  header_names: string[]
  allowed_tools: string[]
  enabled: boolean
  source: "form" | "json" | "url"
  revision: string
  created_at: string
  updated_at: string
}
```

`POST /api/mcp/servers` 接收 `CustomMcpCreate`；`PATCH /api/mcp/servers/{id}` 接受可选公开字段、
`revision` 和 header create/replace/delete 操作。Header value 与 secret value 一样只写不回显。
Header 名必须符合 RFC token，拒绝 `Host`、`Content-Length`、hop-by-hop、proxy authorization 和
平台保留的 `x-kokoro-*`。

### 10.2 JSON import

```ts
type McpImportDraft = {
  draft_id: string
  expires_at: string
  source: "json" | "url"
  normalized: CustomMcpCreate
  warnings: Array<{ code: string; message: string }>
}
```

`POST /api/mcp/imports/json/validate` 接收 `{ config: unknown }`，只允许一个 server，限制 JSON body
为 64 KiB，拒绝未知 transport、内嵌明文环境导出、重复 header 和不可接受 URL。成功返回
`ApiSuccess<McpImportDraft>`。`POST /api/mcp/imports/json/confirm` 接收
`{ draft_id, overrides?: Partial<CustomMcpCreate> }` 并返回 `ApiSuccess<McpServer>`。

```http
POST /api/mcp/imports/json/validate
Content-Type: application/json

{
  "config": {
    "name": "Docs MCP Fixture",
    "transport": "streamable_http",
    "endpoint_url": "https://mcp-fixture.example.test/mcp"
  }
}

200
{
  "ok": true,
  "request_id": "req_fixture_mcp_validate_01",
  "data": {
    "draft_id": "draft_fixture_mcp_01",
    "expires_at": "2026-08-29T12:10:00Z",
    "source": "json",
    "normalized": {
      "name": "Docs MCP Fixture",
      "transport": "streamable_http",
      "endpoint_url": "https://mcp-fixture.example.test/mcp",
      "icon_asset_id": null,
      "instructions": null,
      "headers": [],
      "enabled": true
    },
    "warnings": []
  }
}
```

### 10.3 URL MCP

```ts
type McpUrlInspectInput = {
  name: string
  url: string
  oauth: null | {
    client_id: string
    client_secret: string // write-only
  }
}
```

`POST /api/mcp/imports/url/inspect` 接收 `McpUrlInspectInput`。`client_secret` 与 Header/Secret value
遵循同一 write-only 规则：日志、错误、draft、GET 和审计展示均不得回显，只能返回
`oauth_configured: boolean`。BFF 只把 URL 交给隔离的后端 inspector：仅 HTTPS，
禁止 userinfo，解析后的每次跳转都拒绝 loopback、link-local、RFC1918、metadata endpoint 和内部 DNS；
限制跳转次数、响应大小和总时长。成功返回 `McpImportDraft`，探测不产生安装。

`POST /api/mcp/imports/url/confirm` 接收 `{ draft_id, enabled }`，返回
`ApiSuccess<McpServer>`。validate/inspect 可安全重试；两个 confirm 和所有 MCP mutation 必须携带
`Idempotency-Key`。过期 draft 返回 `410 upload.expired`，endpoint 检查失败返回
`422 connector.endpoint_unreachable`，格式失败返回 `422 connector.import_invalid`。

## 11. Domain 与 Tenant 解析

标准转发上下文的细则见 [`forwarded-context-contract-v1.md`](forwarded-context-contract-v1.md)。

1. 每个独立 Web 仓库/部署只配置一个服务端 `KOKORO_DOMAIN`，本地值为 `dev.kokoro.localhost`；
   浏览器不发送 `X-Domain`；BFF 不读取 Host、query、body、localStorage、Cookie 自定义字段或浏览器
   RFC 7239 `Forwarded` 作为可信上下文，并丢弃这些输入。
2. BFF 到 User、Session、System、Hub、Billing、分享读取等每个后端请求都附加：

   ```http
   Forwarded: host=<KOKORO_DOMAIN>
   ```

   普通 JSON、SSE、下载、错误、重试和 mutation 均适用。BFF 覆盖同名 header，并丢弃 `X-Domain`、Host 与旧
   tenant/site header，避免出现第二个隔离信号；HTTP `Host` 只保留为上游目标连接 authority。
3. 后端先验证 Web BFF 的 service auth 和来源 allowlist，再根据 RFC 7239 `Forwarded` 完成域名 allowlist、租户解析、binding revision、
   身份、权限和数据过滤；`Forwarded` 不是单独认证凭据，Web 不缓存或推导内部 tenant id，不回退默认租户。
4. BFF 只向后端注入服务身份、actor subject、namespace、`request_id` 和 RFC 7239 `Forwarded` 等后端契约字段；
   浏览器响应不得包含 tenant ID、内部 namespace、provider credential 或 binding 详情。
5. Connector、secret、asset、draft、installation 的每次读写由后端重新验证域名上下文和 actor membership；
   不相信资源 ID 自带的前缀。跨 tenant、跨 actor 和不存在统一返回 `404 resource.not_found`。
6. OAuth/authorization `return_to` 只能是当前部署域名的同源 allowlisted path；禁止开放重定向。

## 12. Agent 聊天平台连接

Agent 页面不拼接 Telegram、LINE 或 Slack URL，也不在浏览器保存 provider ticket。打开连接 Dialog
或切换平台时调用：

```http
GET /api/agents/connections/setup?platform=telegram|line|slack
Cache-Control: no-store
```

```ts
type AgentConnectionSetup = {
  platform: "telegram" | "line" | "slack"
  status: "disconnected" | "pending" | "connected"
  qr_value: string
  continue_url: string
  expires_at: string // RFC 3339 UTC
}
```

响应直接使用 `AgentConnectionSetup` wire；BFF 将服务端 RFC 7239 `Forwarded` 与 httpOnly 会话交给后端解析租户和 actor，
不得接收或返回 `tenant_id`、provider access token、OAuth verifier、用户邮箱或内部 namespace。
`qr_value` 与 `continue_url` 必须引用同一短时一次性 setup ticket，最长有效 10 分钟；ticket 绑定
tenant、actor、platform、当前 deployment origin，兑换后立即失效。

`continue_url` 只允许后端配置的 Telegram/LINE/Slack provider allowlist 或当前部署域名的同源回调路径，
禁止任意 scheme、scheme-relative URL、userinfo、开放重定向和浏览器提交 `return_to`。二维码 payload
可以是 HTTPS 或 provider deep link，但不得包含长期 credential。平台未配置返回
`501 agent.platform_not_configured`；票据生成暂时失败返回 `503 agent.setup_unavailable`；未登录返回
`401 auth.required`。GET 不产生 provider 安装，可安全重试，但每次成功响应都签发新的独立 ticket。

## 13. Composer 语音输入边界

当前语音输入使用浏览器 `SpeechRecognition` / `webkitSpeechRecognition`，原始音频不经过 Kokoro
BFF、IAM 或 System 服务；当前实现没有独立的 Kokoro 语音上传、转写或音频存储 endpoint。识别结果只
作为普通文本写入受控 draft；用户仍需显式发送，之后沿用既有会话消息契约。Mock/Preview 只合成文本，
不得把语音识别伪装成后端成功响应。

浏览器不支持、权限被拒绝或识别失败时，前端保持 Composer 原位并返回可访问状态，不把 provider
错误对象、音频、设备 ID 或浏览器权限细节写入 API、日志或分析事件。若后续引入服务端转写，必须
另行定义短时上传凭据、大小/时长限制、内容类型 allowlist、删除时限、幂等和 tenant 隔离契约，
不得复用当前纯浏览器能力作为隐式上传通道。

## 14. Desktop navigation and creation intent boundary

本轮桌面 Web 的胶囊关闭、Rail 导航和 shadcn 菜单均为前端状态/路由行为，不新增后端接口：

- Creation intent 由 AppFrame 的受控状态维护；`dismiss` 只清理当前浏览器的 pending intent，保留 draft，
  不向服务端发送“删除站点”或租户变更请求。
- Rail 的 Agent、Scheduled、Library、Skills 分别进入既有 surface/Settings tab。Scheduled 创建继续使用
  `POST /api/scheduled-tasks` 或 project-scoped endpoint；Library 继续使用 artifact list/content 契约；
  Skills 继续使用 hub skill pool/quota/upload 契约。
- Skills 的 Create 菜单是纯 UI 分流：AI、Upload、GitHub 和 official catalog 各自进入现有客户端流程；
  BFF 不接受浏览器提交的 `tenant_id`，所有资源范围仍由服务端 RFC 7239 `Forwarded` + session context 派生。
- Rail resize/collapse、菜单开关和 overlay close 不改变 API resource version，也不产生 mutation；切换期间保留
  当前 surface projection，避免异步请求完成后恢复已离开的页面。

因此后端 Web Agent 本轮无需新增 endpoint；只需保持现有 Scheduled/Artifact/Hub 契约的错误码、幂等、
缓存和 tenant projection 不变，并在每个后端入口读取 RFC 7239 `Forwarded`。

### 14.1 窄桌面 Web rail 与导航入口

这是 Web shell 的显示与路由契约，不是 API resource：

| 条件 | Rail 行为 | 导航入口 |
| --- | --- | --- |
| CSS viewport `>=769px` | 展开为 `300px`；用户收起时保留 `52px` 图标轨道和单一 seam | 直接聊天 `/app`、项目 `/app/project/{project_id}`、以及 registry 中的一级入口 |
| CSS viewport `<=768px` 且 `pointer: fine` | 隐藏 rail、rail gap、固定容器和 seam，不保留 `52px` 空白轨道；主区仍是 Web，不切换手机 Sheet | Header 只显示一个可聚焦的 navigation trigger；触发后打开同一份完整 rail |
| 任一 Web rail 状态 | 关闭/展开只改变 shell 本地状态；route click 只改变 URL 和 active marker | Agent `/app/agents`、MCP `/app/plugins`、Scheduled `/app/scheduled?tab=calendar`、Library `/app/library`、Skills `/app/skills` |

窄桌面隐藏 rail 后，导航能力不得消失：navigation trigger 必须能打开与宽桌面相同的 registry，且
入口仍使用 `aria-current`/active projection。点击 Agent、Skills、MCP、Scheduled 或 Library 不得
调用 new-chat handler；Scheduled 的 `?tab=calendar` 必须保留。Collapse、hidden、reveal 和 route click
均不得发送 `X-Domain`、tenant/site 字段、`KOKORO_DOMAIN` 或改变任何 API resource revision。

## 15. Desktop interaction boundary v136

本轮胶囊关闭、Rail 切换、Skills Create 菜单和 Agent setup 均为 Web Shell 的本地状态编排，不增加
后端接口：

1. Creation intent 的 dismiss 不删除站点、不修改租户，只清理当前浏览器 pending intent；草稿仍由
   Composer 受控状态持有。
2. Skills Create 的 AI、Upload、GitHub、Official 四项是既有 Hub 客户端流程的 UI 分流；Upload
   进入已有上传 preview/confirm 契约，Official catalog 的添加继续使用 skill mutation 契约。
3. Scheduled 创建沿用 `/api/scheduled-tasks` 或项目作用域 endpoint；Agent setup 沿用连接设置 GET；
   Library 沿用 artifact projection。所有 scope 仍由服务端 RFC 7239 `Forwarded` + httpOnly session 派生，
   浏览器不提交或接收 `tenant_id`。
4. Rail resize/collapse 与 overlay/menu 状态不产生 mutation、不改变 resource revision；页面切换后，
   过期异步结果不得恢复已离开的 surface。

## 16. 资料库一级目录 v137

`/app/library` 是前端一级目录路由，不新增后端 endpoint。页面复用既有 artifact projection：首次加载调用
`GET /api/session/artifacts`（由 `SessionClient.listArtifacts` 封装），下载继续调用既有内容端点并携带同源
httpOnly 会话。筛选、搜索和网格/清单切换均为当前已加载 projection 的本地视图状态，不提交
`tenant_id`、site_id 或任何浏览器可控 scope。

Library direct 与 Settings `library` 明确分工：direct 是跨会话成果目录；Settings library 是授权应用、云端
浏览器和数据管理。来源会话跳转由 shell 的 opaque conversation id handoff 完成，后端仍按 domain binding、
actor membership 和资源归属重新校验；跨 tenant/actor/不存在统一返回 `404 resource.not_found`。preview/dev
的空目录 fallback 仅属于本地 fixture，live BFF 错误必须返回可重试状态，不得用 fixture 覆盖生产租户错误。

## 17. Web Shell active navigation and skill creation

Rail 一级入口的 active state 是前端路由投影，不是后端资源字段：AppFrame 根据当前 pathname 选择
`agent`、`mcp`、`scheduled`、`library` 或 `chat`，交给 shadcn Sidebar 绘制选中态。该状态不进入 API
请求，也不携带或暴露 `tenant_id`/`site_id`。

Skills 的 AI 创建沿用普通会话写入契约，不增加独立“AI skill create” endpoint。前端关闭 Settings、分配
新的 direct session 后，将本地草稿 `/skill-creator` 提示写入新 session draft key；用户显式发送后才进入
既有会话消息/执行契约。Upload/GitHub 继续使用现有 Hub upload preview/confirm，Official 继续使用
skill pool mutation。后端无需接受浏览器提交的 skill namespace 或 tenant 字段。

## 18. Notification center boundary v153

Rail Bell 仅打开 Web Shell 的通知 Popover，不是 Settings/Appearance 的别名，也不增加本轮后端 endpoint。
Popover 的全部/更新日志/消息切换、关闭、焦点恢复和滚动均是前端交互；点击 Bell 不改变 URL，不写入
`#/account/settings/general`，也不改变当前 conversation 或 resource revision。

通知中心未来接入后端时，建议保持如下投影边界：

```ts
type NotificationProjection = {
  id: string
  category: "update" | "message"
  title: string
  description: string
  published_at: string // RFC 3339 UTC
  read: boolean
  media?: { kind: "image" | "video"; src: string }
}
```

读取应按服务端 RFC 7239 `Forwarded`、httpOnly session 和 actor membership 派生 scope；浏览器不得提交或接收
`tenant_id`/`site_id`、内部 namespace、Cookie、token 或 provider credential。跨 tenant/actor/不存在
统一返回 `404 resource.not_found`，读取可安全重试；若未来增加已读/批量已读 mutation，必须要求
`Idempotency-Key`、资源版本与既有错误码矩阵。preview/dev 当前只使用仓库内合成通知 fixture，不能调用
Manus 接口、复制 Manus 正文、图标或媒体资源。`settings.notificationsGroup` 仍只用于通知偏好配置，
面板使用独立 `notifications.*` 文案契约。

## 19. Composer voice boundary v163

本轮语音输入不新增 Kokoro API。preview 为本地合成 fixture；live 由浏览器的
`SpeechRecognition`/`webkitSpeechRecognition` 产生转写文本，原始音频不经过 Kokoro BFF，也不落盘。
只有用户显式发送后，转写文本才沿用既有会话消息/执行契约；Composer 的 listening/transcribing/error
状态、停止和胶囊关闭均为前端状态，不改变 conversation URL、资源版本或 domain binding。

浏览器能力缺失、权限拒绝或启动异常统一映射为可重试的 `role=status` UI，不伪造成功响应；后端无需
接受 `tenant_id`、`site_id`、设备权限或音频字段。

## 20. Current desktop Web shell boundary v167

当前桌面收口不增加后端 endpoint。`300px` 展开 rail、`52px` compact rail、`767px` 细指针阈值、
单 seam、路由 active marker、胶囊 dismiss、语音 listening/transcribing/error 和 overlay close 都是
Web Shell 的本地投影，不属于 IAM、System 或资源 API 字段。宽桌面 `1280×720`/`786×674` 不进入
compact；前端不会把视口、`tenant_id`、`site_id`、内部 namespace 或浏览器可控 scope 发送给后端。

一级 surface 的后端边界保持不变：Agent 使用连接设置 GET/既有 setup ticket，Scheduled 使用既有
`/api/scheduled-tasks` 或项目作用域 endpoint，Library 使用既有 artifact projection，Skills 使用
既有 Hub skill pool/quota/upload/catalog 契约。点击这些导航只改变 URL 与 active presentation，
不触发资源 mutation；过期异步结果不得恢复已离开的 surface。

网站创作胶囊由前端 pending creation intent 控制。dismiss 不删除站点、不改变租户、不调用 API；
只有用户显式发送后，文本才沿用既有会话消息/执行契约。语音输入同样只把浏览器识别到的文本写入
受控 draft，原始音频不经过 Kokoro BFF/IAM/System，不落盘，也不进入日志或分析事件。

## 21. Desktop nested overlay and local voice boundary v171

Rail 收起/展开、Tooltip 生命周期、Skills nested Dialog 层级和本地语音 preview 都属于 Web Shell 状态，不新增
IAM/System/Hub endpoint，也不改变现有资源版本。Skills 外层 Settings 收到 portalled 子 Dialog 的 pointer event 时，
应保持父层打开；只有最外层背幕点击才关闭当前父层。

开发环境语音 preview 仅由前端确定性 fixture 驱动，写入受控 Composer draft；原始音频不进入 Kokoro BFF、IAM、System、
日志或分析。生产浏览器识别文本继续走现有会话消息契约，后端无需接收设备权限、录音数据、`tenant_id`、`site_id` 或
内部 namespace。所有资源范围仍由服务端 RFC 7239 `Forwarded` + httpOnly session 派生。

## 22. Desktop final visual boundary v172

桌面 rail 的 `768px` 以上收起几何与指针类型无关，属于 Web Shell 的表现层；浏览器缩放或远程桌面不会
改变 IAM/System/Hub 的请求范围。网站创作胶囊的默认图标、hover/focus X、dismiss、Tooltip 和焦点交接
同样不新增 API endpoint，也不向后端提交 viewport、pointer、`tenant_id`、`site_id` 或内部 namespace。
关闭胶囊仍只是清理本地 pending creation intent，只有显式发送才沿用既有会话消息契约。

## 23. Skills GitHub import completion boundary v174

Skills 的 GitHub 入口拆成“检查/预览”和“确认导入”两个显式动作，避免把仓库地址误走 zip
上传接口。真实 BFF 使用以下同源 Hub 路径，两个请求都由服务端 RFC 7239 `Forwarded`、httpOnly session
和 actor membership 派生 namespace；浏览器只提交规范化的公开仓库地址，不提交 `tenant_id`、
`site_id`、namespace、访问令牌或 GitHub 凭据：

| Method | BFF path | Request | Response |
| --- | --- | --- | --- |
| POST | `/api/hub/self/skills/github/preview` | `{ "repository": "https://github.com/owner/repo" }` | `{ data: GithubImportResult }` |
| POST | `/api/hub/self/skills/github/import` | `{ "repository": "https://github.com/owner/repo" }` | `{ data: GithubImportResult }` |

`GithubImportResult` 的稳定 projection 为：

```ts
type GithubImportResult = {
  repository: string
  default_branch: string
  skill: { name: string; description: string | null }
}
```

`preview` 只读取并校验来源，不产生技能资源；`import` 必须在服务端重新校验仓库、分支、
技能包内容、大小/文件数量、冲突和当前 workspace 配额后才落库，并以既有 skill pool projection
返回。重复导入同一 content hash 应返回幂等的当前 projection，而不是新增重复技能。外部仓库
不可达、私有仓库、缺少有效 `SKILL.md`、内容超限和冲突均使用既有 typed Hub error envelope，
前端保留可恢复的预览态。

本地 preview client 实现同一两段契约：检查返回确定性合成预览，确认后把合成 personal skill
写回本地 skill pool，随后失活并重取 `hub/skills`，因此导入结果会在关闭子 Dialog 后立即出现在
“已新增的技能”列表中。Create 菜单与 catalog 的入口先关闭 DropdownMenu，再切换 Upload、
GitHub 或 catalog surface；切换不得留下嵌套 Dialog 或重复提交。

## 24. Skills GitHub direct-submit boundary v175

桌面 Web 的 GitHub 对话框已收敛为 Manus 式单提交面：输入通过 `parseGithubRepository` 规范化并做 host/path
边界校验后，点击一次“导入”直接调用 `POST /api/hub/self/skills/github/import`。浏览器不再展示 preview
结果或要求用户确认第二次；`preview` endpoint 可继续被旧客户端注入使用，但不是 v175 UI 的交互契约。

| Method | BFF path | Request | Response |
| --- | --- | --- | --- |
| POST | `/api/hub/self/skills/github/import` | `{ "repository": "https://github.com/owner/repo" }` | `{ data: GithubImportResult, requestId? }` |

前端状态只有 `input → importing → done`，失败回到 input 并保留可修复的 inline error。Dialog 关闭会取消本次
attempt，迟到响应不得刷新已经离开的 surface；成功后失活 `hub/skills` 并重新读取技能池。仓库地址必须是
HTTPS 的 `github.com/{owner}/{repo}`（可接受 `.git` 后缀），拒绝 userinfo、query、hash、额外 path segment
和其它 host。BFF 仍须重新校验公开仓库、有效 `SKILL.md`、大小/文件数、冲突、配额和 content hash 幂等性。
错误继续使用 typed Hub error envelope；浏览器只提交规范化 repository，不提交 tenant/site/namespace、令牌或
GitHub 凭据。

## 25. Skills GitHub visual-only alignment v176

v176 只收口桌面 Dialog 的布局，不改变 v175 的 API：`POST /api/hub/self/skills/github/import` 仍为唯一可见提交动作，
客户端仍只发送规范化 `repository`。弹窗的 header/form/footer 分段、关闭按钮尺寸和 URL placeholder 属于 User Web
表现层，不向 IAM、System 或 Hub 增加字段，也不改变租户隔离派生规则。

## 26. Skills catalog and preview-only fallback v183

v183 只扩充桌面 Web 的表现层闭环，不要求新增 IAM/System 字段。技能目录与 Settings 技能池继续使用通过
service auth/allowlist 校验的 RFC 7239 `Forwarded` binding、httpOnly session 和 actor membership 派生 workspace scope；浏览器不得提交 `tenant_id`、`site_id`、
namespace、凭据或 token。

目录查询仍使用既有接口：

```http
GET /api/hub/self/skills/catalog?scope=official|third_party&query=<optional>&cursor=<optional>
```

返回 `SkillCatalog { skills: SkillCatalogCard[]; next_cursor?: string | null }`。`official` 与 `third_party` 是目录
投影范围，不是浏览器可写的租户边界；前端只根据响应渲染筛选和已安装状态。添加目录项继续复用：

```http
POST /api/hub/self/skills/{name}/enable
```

成功后失活 `hub/skills` 与目录查询键，失败显示可恢复的卡片内错误。

GitHub 对话框保持 v175 的单提交行为：存在 `importGithub` 时只调用 `/api/hub/self/skills/github/import`；旧的或只读
注入客户端若只有 `previewGithub`，界面明确显示“已读取技能信息；当前连接不支持保存导入”，不得调用
`onImported` 或刷新池来暗示持久化。两种情况下浏览器请求都只含规范化的
`{ repository: "https://github.com/owner/repo" }`。服务端仍需重新校验公开仓库、`SKILL.md`、大小/文件数量、冲突、
配额和 content hash 幂等性。

网站创作胶囊仍是 Web Shell 本地状态：`dismiss` 不产生 API 请求，只有用户显式发送时才进入既有会话消息契约。
本节只覆盖桌面 Web，不调试或修改手机端。

## 27. Skills upload presentation and v187 client boundary

Skills 的上传 Dialog 是 Web presentation，不新增资源接口。它保留既有 Hub upload contract：

```http
POST /api/hub/self/skills/upload/preview   multipart/form-data: file=<.zip|.skill>
POST /api/hub/self/skills/upload/confirm   multipart/form-data: file=<.zip|.skill>, names=<JSON array|null>
```

`preview` 返回 `{ data: UploadPreview }`，`confirm` 返回 `{ data: UploadConfirm, requestId? }`。前端通过同一个独立
Dialog 展示 dropzone、预检、候选选择、发布中和完成态；Dialog 的打开、关闭、拖放高亮和焦点恢复不进入 API。
`confirm` 必须带 `Idempotency-Key`，服务端仍需按服务端 RFC 7239 `Forwarded`、httpOnly session、actor membership 派生当前
workspace namespace，并重新校验归档格式、根目录 `SKILL.md`、YAML 元数据、文件数量/大小、冲突、配额与 content hash
幂等性。浏览器不得提交 `tenant_id`、`site_id`、namespace、凭据或 token。

`.zip` 和 `.skill` 是浏览器入口允许的两种文件扩展名；这不是后端放宽校验，后端仍以内容和 MIME/归档安全策略为准。
预检失败、非法文件、空候选、发布失败都必须返回可恢复的 typed Hub error envelope；迟到的 response 不得更新已关闭的
surface。旧 standalone `SkillsPanel` 的 tab 兼容入口仍可复用同一 client 方法，但 Settings 嵌入面不再把页面切换成
inline Upload，而是使用独立 Dialog。

网站创作胶囊与上述接口无关：dismiss 只清理 Web Shell 的 pending creation intent，URL、draft 和后端会话不变；只有
用户显式发送时才沿用已有会话消息/执行契约。

## 28. Skills v188 cancellation and cache reconciliation boundary

GitHub 导入的 User Web transport 继续只提交规范化 `repository`，但客户端为长请求提供取消信号：

```ts
type GithubImport = (repository: string, signal?: AbortSignal) => Promise<GithubImportResult>
```

`AbortSignal` 只控制浏览器到 BFF 的请求生命周期，不改变服务端导入的幂等、权限、workspace scope 或错误契约。
上传预检与发布同样接受可选 `AbortSignal`：

```ts
type UploadPreview = (file: Blob, signal?: AbortSignal) => Promise<UploadPreviewResult>
type UploadConfirm = (file: Blob, names: string[] | null, signal?: AbortSignal) => Promise<UploadConfirmResult>
```

关闭/卸载上传 Dialog 会取消尚未完成的预检或发布请求，并使迟到 response 失效；服务端的发布幂等仍由
`Idempotency-Key` 保证。
服务端仍以 `Idempotency-Key`、服务端 RFC 7239 `Forwarded`、httpOnly session 和 actor membership 派生 workspace；浏览器
不提交 `tenant_id`、`site_id`、namespace、凭据或 token。Dialog 关闭/父 Settings 卸载后的迟到 response 不得更新 UI，
也不得触发 `hub/skills` 刷新回调。

导入或上传成功后的客户端对账动作同时失活：

```text
hub/skills
hub/skills/catalog/<client-scope>
```

这两个 key 仍是 User Web 本地 server-state 查询键，不是后端资源名；它们只确保技能池和目录的 installed projection
不会互相显示旧缓存。刷新失败时保留 stale data，并在技能池展示可重试状态。

技能详情当前使用 `SkillCard` 的稳定摘要生成只读 YAML 预览；在 Hub 提供完整 `SKILL.md` 内容接口前，不向后端
虚构文件树、revision 或额外内容字段。后续增加内容读取时，应沿用当前 workspace 派生范围与同一响应 envelope。

## 29. Skills v189 embedded presentation and import boundary

v189 没有新增后端字段，补充的是前端嵌入布局与导入入口的稳定边界。Settings → Skills 的嵌入 body 必须遵守父
surface 的内容宽度：`width:100%`、`max-width:100%`、`box-sizing:border-box`。这是 Web layout contract，不是 Hub
资源字段；后端不得通过返回更宽的卡片数据来弥补布局溢出。

Skills 的两个创建入口都复用同一个动作契约：菜单 `onSelect` 只触发一次，关闭菜单后再打开 Upload 或 GitHub
Dialog；父 Settings Dialog 在子 surface 完成或关闭后继续保持挂载。客户端不把 GitHub 地址送入 multipart upload，
也不把上传文件送入 GitHub import。

GitHub import 的浏览器契约仍为：

```http
POST /api/hub/self/skills/github/import
Content-Type: application/json
Idempotency-Key: skill-github-import:<request-id>

{ "repository": "https://github.com/owner/repo" }
```

客户端只接受并规范化 HTTPS `github.com/{owner}/{repo}`（可移除 `.git` 后缀），拒绝 userinfo、显式端口、query/hash、
额外 path segment、双斜线和其它 host。服务端必须再次执行同样的 host binding、仓库可达性、公开/权限、`SKILL.md`、
大小/文件数、冲突、配额和 content-hash 幂等校验；浏览器不提交 tenant/site/namespace、GitHub token 或其它凭据。

响应沿用既有 envelope：

```ts
type GithubImportResult = {
  repository: string
  default_branch: string
  skill: { name: string; description: string | null }
}
```

UI 状态是 `input → importing → done`。能力仅有 `previewGithub` 时，必须明确显示 preview-only，不得触发持久化回调；
能力提供 `importGithub` 时，成功后前端同时失活 `hub/skills` 和 `hub/skills/catalog/<client-scope>`，确保技能池与目录
不会继续显示旧的 installed projection。`AbortSignal` 只取消浏览器请求，不改变服务端幂等语义；已关闭 surface 的迟到
响应不得更新 UI。

网站胶囊是 Web Shell 本地状态，不产生 API 请求；关闭只移除 creation intent，draft、URL 与会话消息契约保持不变。
上传仍复用 v187 的 preview/confirm multipart contract，入口只接受 `.zip` 与 `.skill`，父 Settings 不切换为旧 inline tab。

## 30. Skills v190 visual and scope projection boundary

v190 没有新增浏览器接口。网站创作胶囊是纯 Web Shell 状态：静止态使用代码窗口
图标，hover/focus 在同一固定槽位显示 X；dismiss 不发送请求、不改变 conversation
URL、不清理 draft，也不把 `tenant_id`、`site_id` 或内部 scope 暴露给浏览器。

Skills 的 GitHub 导入仍使用既有 JSON contract：

```http
POST /api/hub/self/skills/github/import
Content-Type: application/json
Idempotency-Key: skill-github-import:<request-id>

{ "repository": "https://github.com/owner/repo" }
```

客户端负责 canonical repository 校验与一次性提交；BFF/Hub 负责当前请求范围内的
仓库访问、`SKILL.md`、冲突、配额和幂等校验。前端只消费返回的技能摘要，不提交或
回显 GitHub token。

池与目录的 `scope` 是技能来源投影（例如 `official`、`third_party`、`personal`），
不是租户身份参数。前端 fixture 和 UI override 必须以 `scope/name` 作为视图键；
GitHub 导入只替换 personal projection，不能按裸 name 删除同名 official 或
third-party projection。后端返回同名跨 scope 投影时，也必须维持各投影的稳定
scope/content hash，避免 Web 合并时发生跨范围覆盖。

导入成功后继续失活 `hub/skills` 与 `hub/skills/catalog/<client-scope>` 两个查询
投影；关闭/取消时迟到响应不得更新 Settings surface。以上为桌面 Web 契约，不覆盖
手机端。

## 31. Skills v191 visible completion and source-scope disambiguation

v191 不新增资源 endpoint。GitHub 导入仍使用 v189/v190 的单次 JSON 提交；成功后前端接收完整的
`GithubImportResult`，失活技能池与目录查询，并在关闭子 Dialog 后将刚导入的 personal projection 提升到列表首项。
列表提示、提示关闭、最近导入排序均为 User Web presentation，不产生额外请求，也不回显 token、namespace、tenant 或 site。

当同一个技能名存在多个来源 projection 时，技能启停与修订读取允许携带来源 `scope` 查询参数，以避免裸 name 串改：

```http
POST /api/hub/self/skills/{name}/enable?scope={scope}
POST /api/hub/self/skills/{name}/disable?scope={scope}
GET  /api/hub/self/skills/{name}/revisions?scope={scope}
```

`scope` 是 Hub 返回的技能来源投影，例如 `official`、`third_party`、`personal` 或 namespace projection；它不是浏览器
可写的租户身份字段。`scope` 缺省时保留既有 name-only 调用兼容性，User Web 从池/目录返回的 card scope 存在时应总是
携带它。BFF/Hub 必须从当前可信 session 和 workspace binding 校验 scope 归属，不能信任客户端借 query 参数越权访问
其它 workspace。

请求成功仍只要求既有 HTTP 状态/`{ data, requestId? }` envelope 规则；错误继续使用 `hubErrorSchema`。前端 mutation
查询键使用 `scope/name`，因此同名 projection 的 enabled、installed、required lock、revision loading 不会互相覆盖。
这只是现有 Skills contract 的 query disambiguation，不改变 GitHub 导入 body：

```json
{ "repository": "https://github.com/owner/repo" }
```

本节只覆盖桌面 Web；手机端不纳入本轮验证。

## 32. Desktop Capsule and Skills import boundary v193

本节是 User Web 对已完成桌面交互的契约化记录，**本轮只更新文档，没有修改或实现后端接口**。下面的 BFF path 是
后续真实对接目标；本地 preview client 的行为不能视为这些接口已经上线。

### 32.1 网站创作胶囊与环境投影

网站创作胶囊是 Web Shell 本地状态，不产生 API 请求：

- 唯一控件是 `68×32px` 的 shadcn `Button`，固定 `16×16px` 图标槽；静止态显示网站语义图标，hover/focus 显示 X，点击任意
  区域都执行同一个 dismiss action。
- dismiss 只清理当前 creation intent；draft、conversation URL、表单状态和 Composer 焦点保留，不提交 message、不发送 tenant/site
  或其它内部 scope 字段。
- Composer 当前展示的环境选择器是只读 presentation projection，使用 `role="status"`，不是可提交的环境 mutation，也不应创建
  一个额外的后端 environment endpoint。

### 32.2 GitHub child Dialog 与浏览器请求

Skills Create 菜单（Settings 主池与 Catalog）均先关闭菜单，再打开同一个 child Dialog。桌面 Dialog 目标几何为 `400×344px`；
这不是 wire 字段，但必须保持父 Settings 挂载、child 内焦点和 return-focus 行为。

输入 canonicalization：

```ts
type GithubImportRequest = {
  repository: `https://github.com/${string}/${string}`
}

// UI accepts OWNER/REPOSITORY or an HTTPS GitHub URL, then sends one canonical value.
```

canonical repository 去掉 `www` 与可接受的 `.git` 后缀并规范化 owner/repository；非 HTTPS、非 `github.com` host、端口、userinfo、
query/hash、额外路径段、双斜线和非法仓库字符必须在客户端拒绝，BFF 必须再次校验。浏览器请求不得携带 tenant/site/namespace、GitHub
token 或其它凭据。

可见持久化导入仍为：

```http
POST /api/hub/self/skills/github/import
Content-Type: application/json
Idempotency-Key: skill-github-import:<request-id>

{ "repository": "https://github.com/owner/repo" }
```

响应继续使用现有 envelope 与摘要投影：

```ts
type GithubImportResult = {
  repository: string
  default_branch: string
  skill: { name: string; description: string | null }
}
```

一次提交只允许一个 import attempt。浏览器可通过 `AbortSignal` 取消等待中的 fetch；关闭/卸载/父 surface 切换时 attempt guard 使迟到
响应失效，返回焦点给原创建入口。Abort 只取消浏览器等待，不宣称服务端导入已回滚，也不改变服务端 `Idempotency-Key` 语义。

### 32.3 Preview-only 与 import 能力边界

`previewGithub` 是可选的本地/旧 client 能力，不是本节新增的生产 endpoint：

- 仅有 `previewGithub` 时，UI 必须明确标注 preview-only/只读预览，不调用 `onImported`、不刷新技能池，不声称已安装或已持久化。
- 有 `importGithub` 时，成功结果才触发 imported 回调与 client-side pool/catalog reconciliation；成功提示和 recent personal card 是前端
  projection，后端真实持久化仍以 BFF 响应为准。
- 导入成功后的 UI 失活 `hub/skills` 与 `hub/skills/catalog/<client-scope>` 查询投影；服务端实现必须自行保证 ETag/cache invalidation、
  workspace 权限与幂等，不能把前端 query key 当成后端资源名。

### 32.4 Catalog、详情与 Try 的真实对接边界

Catalog 继续使用：

```http
GET /api/hub/self/skills/catalog?scope=official|third_party&query=<optional>&cursor=<optional>
```

UI 必须连续消费 `next_cursor` 到 `null`（即 `next_cursor=null`），不存在 20 页静默截断；重复 cursor 停止，超过 100 页是客户端可见错误。服务端需返回与
`scope + query + cursor` 稳定绑定的 opaque cursor，并在可信 session/workspace 范围内过滤，不能信任浏览器 scope 参数扩大可见范围。

当前 Skill detail/Try 使用 `SkillCard` 派生的只读 presentation fixture：文件树、YAML 和 prompt 卡片不代表后端已提供完整
`SKILL.md`/files/revision 内容。Settings 内 Try 的 Web handoff 是关闭 Settings、启动/切换 direct chat、必要时 pin、写入本地化
Composer draft 并恢复焦点；本轮不新增 `/try` endpoint，也不把 prompt 选择作为后端请求参数。真实详情字段与可选 activation action 仍需后续
BFF contract 扩展后再接入。

本节只覆盖桌面 User Web；真实 BFF、Hub/Capability 和内容 projection 仍待契约对接，不修改 IAM/System 的 tenant 解析规则，也不覆盖手机端。

## 33. Site 独立仓库与 v196 前端边界

当前 Kokoro Web 的发布单元是 GitHub 独立仓库 `LordFoxFairy/kokoro-app`，本地 checkout 目录为 `kokoro`，package 名为 `@kokoro/app`。
这不会新增 API，也不会把仓库名或产品 slug 作为浏览器请求字段。后续产品使用自己的独立仓库；
通用能力（包括 Skills/GitHub client、菜单投影、i18n 解析、shadcn/Radix 交互和 request/error helpers）
进入独立共享仓库的版本化 package。页面布局、品牌文案、SEO、素材和 token preset 留在各自产品仓库。

local 只配置 `KOKORO_DOMAIN=dev.kokoro.localhost`；test 使用 `.env.test` 的
`test.kokoro.localhost`，prod 使用部署平台注入的绑定域名。它们都是服务端部署元数据，不参与前端代码选择；
BFF 将当前环境的值作为 RFC 7239 `Forwarded` 发给后端，由后端解析可信 tenant context。浏览器不读取或提交
`KOKORO_DOMAIN`、`tenant_id`、`site_id`、workload token 或内部 namespace。浏览器请求中的 HTTP `Host` 仍可由
协议栈携带，但不参与租户选择；BFF 出站时由上游 URL 决定连接 authority，并单独写入唯一的 `Forwarded`。

网站胶囊是 Web Shell 本地状态，关闭不调用 API。Skills GitHub 导入仍使用本节既有
`POST /api/hub/self/skills/github/import` JSON contract；`OWNER/REPOSITORY` 只在 UI/client 侧
转换为 canonical URL，BFF/Hub 必须再次完成认证、domain binding、权限、资源校验、幂等和审计。菜单、
Dialog、焦点与取消语义属于前端交互契约，不代表后端已经提供额外 endpoint。

## 34. Deployment/package 与桌面详情动作边界 v198

当前首个发布单元为 GitHub 独立仓库 `LordFoxFairy/kokoro-app`（本地 checkout 目录为 `kokoro`），根 package 为 `@kokoro/app`，本地 domain 为
`dev.kokoro.localhost`。后续 Site 继续一站点一仓库；通用包在出现第二个消费方或独立发布需求后整体迁移到兄弟
`kokoro-web-shared` workspace，以 registry + semver + lockfile 交付，不为每个菜单或业务能力创建一个 Git 仓库。

本轮的资料库默认空态、Skills 详情动作栏、分享 URL、合成 `SKILL.md` 下载和全屏阅读器都是 User Web presentation
行为，不增加 IAM/System/Hub endpoint。真实后端接入时仍需由 BFF 根据 domain binding、httpOnly session 和 workspace
权限返回 artifact/detail projection；浏览器不得发送或接收 `tenant_id`、`site_id`、namespace、内部 token 或凭据。

本节只覆盖桌面 User Web；手机端不纳入本轮契约和回归。

## 35. Composer `useVoiceInput` API 边界 v210

本节以当前 User Web 源码为准，明确语音输入**不新增后端 API**。v200 中关于波形/计时器/录音完成动作的描述属于
历史参考记录，现行实现是同一个 Composer 麦克风按钮的内联状态机。

### 35.1 前端 controller contract

`useVoiceInput` 的受控输入为：

```ts
type UseVoiceInputOptions = {
  draft: string
  onDraftChange: (value: string) => void
  preview: boolean
  previewTranscript: string
}

type VoiceInputState = "idle" | "listening" | "transcribing" | "error"
```

Composer 将 controller 映射到一个固定的 `32×32px` shadcn `Button`：

- `data-state` 始终反映 controller 状态；`aria-pressed` 仅在 `listening`/`transcribing` 为 `true`；
- 活动态的 accessible name 是停止语音输入，其他状态是语音输入；
- 状态提示使用同一 `role=status`、`aria-live=polite` 节点；它不产生新的视觉布局层；
- cancel、unmount 和 attempt invalidation 必须清理 preview timer、abort live recognition，并丢弃迟到事件。

这些是浏览器端 presentation/interaction contract，不是后端资源字段。浏览器不发送 `voice_state`、设备权限、录音计时、
`tenant_id`、`site_id` 或其它内部 scope。

### 35.2 Preview 与 live 行为

当 `preview=true` 时，客户端使用合成文本：点击后保持 `listening` 620ms，再保持 `transcribing` 220ms，完成后按
现有 draft 追加 `previewTranscript`。再次点击会取消 pending timer，取消路径不调用 `onDraftChange`。
该 fixture 不提交任务、不访问 BFF、不改变 URL，也不能被解释为服务端转写成功。

当 `preview=false` 时，客户端仅使用浏览器 `SpeechRecognition` 或 `webkitSpeechRecognition`：

```ts
recognition.continuous = false
recognition.interimResults = false
recognition.lang = document.documentElement.lang || navigator.language
```

识别结果写回受控 draft；正常结束回到 `idle`。浏览器缺少构造器、启动异常或 `onerror`（包括权限拒绝）进入统一
`error` 状态。浏览器自身的权限提示不属于 Kokoro API 或 DOM surface，Kokoro 不创建录音 Dialog、Popover、上传面板或
自定义权限接口。

### 35.3 Wire、音频和既有消息契约

浏览器原始音频不经过 Kokoro BFF、IAM 或 System，不落入 API body、日志、fixture、截图或持久化存储；本仓库没有
`POST /api/voice`、音频上传、语音转写或音频存储 endpoint。BFF 不应接收或转发 `audio`、`audio_blob`、`media_url`、
设备权限结果或浏览器凭据。

只有用户显式发送已经写入 Composer draft 的文本时，才沿用既有任务消息接口：

```http
POST /api/tasks/{task_id}/messages
```

语音功能不改变该消息 endpoint 的 request/response envelope、幂等、SSE 或错误码，也不添加“语音来源”字段；识别文本
只是用户草稿内容。preview 与 live 都不得发送 `X-Domain`、`KOKORO_DOMAIN`、tenant/site header 或浏览器 `Forwarded`。

当前前端验收以 `tests/ui/composer.test.tsx` 与 `tests/ui/use-voice-input.test.tsx` 的 preview 转换、cancel、
unsupported/error、live recognition、原位 DOM 和入口分态断言为准；定向运行共 56/56 通过。本节只覆盖桌面 Web，
不覆盖手机端。真实浏览器 SpeechRecognition 是否可用由浏览器决定，不应在后端用成功 fixture 冒充。

### 35.4 Creation capability selection has no API request

直接会话首屏的制作简报、建立网站、设计、制作游戏胶囊是 Web presentation state，不是资源创建请求：

```ts
type CreationIntent = "presentation" | "website" | "design" | "game" | "app"
type CreationIntentSelect = (intent: CreationIntent) => void
```

点击胶囊只更新 shell-owned `creationIntent`、placeholder 和对应的本地工作流组件；不得发送 `POST`、修改 URL、创建空 task 或把
`creation_intent`、`site_id`、`tenant_id` 写进消息 body。点击工作流内部示例卡片后，只有用户随后显式提交的文本才沿用既有：

```http
POST /api/tasks/{task_id}/messages
```

预览模型目录沿用既有 `GET /api/session/models` typed response，仅用于渲染 presentation/design 的模型选择器；中性、Website、App 首屏
可由站点壳层隐藏该选择器。`display_name` 是 UI 文案，不是可直接信任的 provider 权限或路由信息；真实服务端仍需按 workspace policy 再解析
model selector。胶囊关闭同样只清除本地 creation intent，不调用 API。
