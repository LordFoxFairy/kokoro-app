# Manus-inspired User Web 工作台与 API 契约 v2

状态：历史设计依据。后端 Web Agent 的权威实现契约已经迁移到
[`user-web-bff-contract-v3.md`](./user-web-bff-contract-v3.md)。本文保留桌面工作台设计背景，
若路径、字段、状态或安全边界与 v3 冲突，以 v3 为准。

> 当前 kokoro-app 的实际 Chat 路径、scope、SSE 和 Gateway 边界以
> [`integration/user-web-api-contract-v4.md`](./integration/user-web-api-contract-v4.md) 为准。
> 下方的旧版入口只保留历史设计背景，不得作为当前 `/api/session/*` 路由示例复制。

## 1. 契约分层

```text
GET /api/system/runtime-manifest       启动能力和导航投影
GET /api/system/composer-catalog       Composer 可选项
GET /api/workspace/context              当前 workspace/project 上下文
GET /api/session/sessions               任务/会话列表
POST /api/session/sessions/{session_id}/messages  创建消息并启动/续接 Run
GET /api/session/sessions/{session_id}/events     SSE 增量事件
```

浏览器只调用同源 BFF。Host 解析出的 tenant context 由服务端注入；浏览器请求体和响应不得包含 `tenant_id`、`site_id`、workload token 或 IAM token。

### 1.1 API 设计借鉴的可复用部分

参考 Manus API 的公开契约，Kokoro 采用以下可复用原则，但不兼容或复制其 API：

- 列表接口使用 `limit + cursor + order`，响应返回 `has_more`、`next_cursor` 和 `request_id`，避免基于页码的历史列表在新任务插入时跳页。
- 成功与失败都带稳定的 envelope；失败只让前端依赖 `error.code`、`retryable` 和 `request_id`，不依赖文案或 HTTP body 的偶然结构。
- 任务状态是有限枚举：`queued`、`running`、`waiting`、`completed`、`stopped`、`failed`；HITL 等待必须是显式状态，不用“运行中但按钮不可用”表达。
- 详情、消息/事件、成果下载分开建模；列表只返回导航所需摘要，Canvas 再按 opaque resource ref 获取成果。
- 任何创建、更新、分享、确认、删除动作都支持 `Idempotency-Key`；重试时服务端返回同一个 receipt，而不是创建重复执行。

### 1.2 与 Kokoro 当前实现的对齐（必须以此为准）

Manus v2 的公开 API 将 `task`、`project`、`file`、`webhook` 分成独立资源，并统一使用
`ok/request_id/error` envelope；Kokoro User Web 采用同样的资源分层，但不直接复用 Manus
的 URL、字段名或认证方式。当前第一站已经落地的 BFF 边界如下：

| Web 能力 | 浏览器实际入口 | BFF 转发的资源 | 当前幂等约定 |
| --- | --- | --- | --- |
| 会话清单 | `/api/session/sessions?cursor=` | `/sessions` | 只读，不生成幂等键 |
| 新消息/新运行 | `/api/session/sessions/{id}/messages` | `/sessions/{id}/messages` | body `idempotency_key`，失败重试复用同键 |
| 会话快照 | `/api/session/sessions/{id}` | `/sessions/{id}` | 只读 |
| 增量事件 | `/api/session/sessions/{id}/events` | `/sessions/{id}/events` | `Last-Event-ID` 续流 |
| HITL 控制 | `/api/session/sessions/{id}/runs/{run}/control` | 同路径 | 控制 body 带 `decision_id` |
| 分享/撤销 | `/api/session/sessions/{id}/share` | 同路径 | 活跃分享重复创建返回同 `share_id` |
| 作品库 | `/api/session/artifacts?cursor=` | `/artifacts` | 只读游标分页 |

因此后端 Web Agent **不得**按 Manus 文档直接实现 `/v2/task.*`，也不得要求浏览器提交
`tenant_id`、`site_id` 或任何 token。Host 解析域名得到的租户上下文只存在服务端请求信封中；
User Web 只持有 opaque `session_id`、`run_id`、`share_id` 和 `content_hash`。

### 1.3 状态映射

Manus 的 `running / stopped / waiting / error` 在 Kokoro 中映射为更细的执行状态，避免把
HITL 和普通运行中混在一起：

| Manus 参考状态 | Kokoro 服务端/前端语义 | UI 表现 |
| --- | --- | --- |
| running | `pending` → `streaming` | Composer 可停止；事件持续进入时间线 |
| waiting | `awaiting-hitl`，快照中 `pending_pauses[].status=pending` | 明确显示“等待你的批准”，主按钮为“取消等待” |
| stopped | `completed` 或 `cancelled` | 终态消息、成果和下载入口可用 |
| error | `failed` | Alert + 可重试；重试按幂等规则生成正确的新运行 |

客户端状态机不能根据颜色、按钮文案或网络连接状态猜测运行状态；状态只来自快照和
SSE 事件契约。`event_watermark` 与 `Last-Event-ID` 是重连边界，重连后不得重复追加已经
折叠的事件。

### 1.4 后端必须补齐的 envelope 细节

当前 User Web 的旧服务实现仍有部分 `{ "error": "..." }` 简化错误体。后端 Web Agent
在新接口上应统一迁移为：

```json
{
  "ok": false,
  "request_id": "req_example",
  "error": {
    "code": "run.failed",
    "message": "The run failed.",
    "retryable": true,
    "details": {}
  }
}
```

兼容期由 BFF 将旧错误体转换为上述 envelope；业务客户端只读取 `error.code`、
`error.retryable` 和 `request_id`。列表响应必须明确返回 `has_more` 与 `next_cursor`，
而不是让 Web 通过“当前页数量小于 limit”推断是否还有数据。

Manus 的 webhook 签名校验适用于服务到服务回调，不应暴露给浏览器。Kokoro 若后续增加
异步回调，应在 System/Session 服务端验证签名、时间窗和重放键，再通过同一 SSE/session
事件模型投影给 User Web；不要新增一套前端 webhook 状态机。

建议的 User Web BFF 成功 envelope：

```json
{
  "ok": true,
  "request_id": "req_123",
  "data": [],
  "has_more": false,
  "next_cursor": null
}
```

建议的失败 envelope：

```json
{
  "ok": false,
  "request_id": "req_123",
  "error": {
    "code": "run.failed",
    "message": "The run failed.",
    "retryable": true,
    "details": {}
  }
}
```

`request_id` 用于日志关联和用户反馈；它不是租户标识。所有租户隔离仍由 Host → IAM/System → BFF 的服务端 envelope 完成，Web 不接收也不提交 `tenant_id`。

### 1.5 当前代码与 v2 契约的迁移边界

当前 `src/contract/http.ts` 仍保留第一站历史的资源 payload（例如
`{sessions, next_cursor}`），这是为了让现有 Session Engine 在后端切换期间继续可运行，
不是对 v2 envelope 的否定。后端 Web Agent 接入 v2 时按以下顺序迁移：

1. BFF 先把旧服务的成功/失败响应归一化为 `ok/request_id/data/error`，浏览器端继续只读 BFF。
2. 列表 BFF 在 `data` 内保留现有资源字段，同时补出顶层 `has_more`、`next_cursor`；不要把
   `tenant_id` 或内部 binding 放进 `data`。
3. SSE 先保持现有事件 `kind/payload/event_watermark`，增加 `Last-Event-ID` 续流和
   `request_id` 响应头；不要让前端同时维护第二套 webhook/polling 状态机。
4. BFF 与 System/IAM 完成灰度后，再更新 `src/contract/http.ts` 的生成源和 parser；禁止
   直接手改生成文件，也禁止在 UI 层兼容多个后端 envelope。

因此当前实现的唯一明确 gap 是**BFF envelope 归一化尚待后端落地**，不影响桌面 UI 的状态机、
shadcn 组件基座或多站点皮肤边界。

## 2. Workspace context

`GET /api/workspace/context` 返回当前站点允许展示的上下文模块：

```json
{
  "workspace": { "display_name": "Personal workspace", "plan": "free" },
  "project": null,
  "modules": [
    { "key": "instructions", "enabled": true, "count": 0 },
    { "key": "connectors", "enabled": true, "count": 0 },
    { "key": "files", "enabled": true, "count": 0 },
    { "key": "skills", "enabled": true, "count": 2 },
    { "key": "websites", "enabled": false, "count": 0 },
    { "key": "schedules", "enabled": false, "count": 0 }
  ]
}
```

`modules` 是能力投影，不是前端路由清单。Web 只能把已注册的 `key` 映射到本地组件；未知 key 进入 disabled/unavailable，不可执行任意 URL、组件名或代码。桌面主导航默认不渲染尚未接入的 disabled 模块，避免把半成品入口伪装成可用能力；只有站点明确要求展示并提供对应交互时，才以不可执行的状态说明呈现。

当前一级注册路由包含 `mcp -> /app/plugins`。该页面是连接器与资料来源目录，不是 Settings
弹窗；Settings 中的 `mcp` 仍作为已添加连接器、Custom API 和 MCP 的管理面。Rail、Command
Menu 和直接 URL 必须复用同一个本地注册项，runtime manifest 只能重命名或关闭入口，不能覆盖
目标 URL。

插件目录的后端 projection 必须显式区分两类产品数据，禁止复用 Custom API 管理目录冒充
资料来源：

```http
GET /api/connectors/catalog?kind=connector&cursor=...
GET /api/connectors/catalog?kind=data_source&cursor=...
```

```json
{
  "items": [
    {
      "id": "opaque_catalog_ref",
      "kind": "data_source",
      "name": "Display name",
      "description": "Localized description",
      "icon_url": "/api/connectors/assets/opaque_asset_ref",
      "connected": false
    }
  ],
  "next_cursor": "opaque_cursor_or_null"
}
```

`kind` 由前端固定枚举，服务端必须校验；`id`、`icon_url` 和 cursor 均为不透明引用。浏览器不接收
供应商密钥、内部 adapter 名称、tenant/site 标识或上游账户凭据。搜索使用同一 kind 轴和服务端
cursor；本地 fixture 仅模拟该 projection，不定义正式供应商能力。

未来项目能力闭合后再增加：

```http
GET    /api/workspace/projects
POST   /api/workspace/projects
GET    /api/workspace/projects/{project_id}/context
PATCH  /api/workspace/projects/{project_id}/context/{module}
DELETE /api/workspace/projects/{project_id}
```

项目上下文更新必须使用 `Idempotency-Key`；删除必须使用 AlertDialog 二次确认。项目上下文只改变任务默认配置，不绕过 Session/IAM 授权。

## 3. Session / task

任务与会话共用执行协议，项目只表达组织关系。`/app` 的直接会话和
`/app/project/{project_ref}` 的专案任务是两套互斥列表：前者只返回无 `project_ref` 的会话，
后者只返回完全匹配该不透明引用的会话。专案默认入口仍是聊天，但首条消息必须绑定专案：

```json
{
  "prompt": "Build a launch checklist",
  "project_ref": "project_123",
  "mode": "fast",
  "model": "provider:model",
  "agent": "general",
  "pinned_skills": ["research-brief"]
}
```

列表筛选由浏览器通过产品上下文表达，不携带 tenant/site 轴：

```http
GET /api/session/sessions?scope=direct
GET /api/session/sessions?project_ref=project_123
```

`project_ref` 是路由中的不透明资源引用，不是用户可编辑的租户标识。BFF 仍从 Host 和
httpOnly 信封派生 tenant/site，并验证当前用户对该专案的成员资格后才转发。浏览器响应只返回
会话摘要和资源引用，绝不回显 tenant_id、site_id 或内部 binding。

服务端从 Host/session envelope 派生隔离上下文，并在 receipt 中回显最终解析值：

```json
{
  "session_id": "session_123",
  "run_id": "run_123",
  "status": "queued",
  "resolved": {
    "mode": "fast",
    "model": { "provider": "provider", "name": "model" },
    "agent": { "name": "general", "display_name": "General" }
  }
}
```

首条消息提交后，mode/model/agent 对当前 session 锁定；客户端不得把本地默认值当成执行事实。

## 4. Privacy / share

- 任务默认 private。
- `POST /api/session/sessions/{session_id}/share` 创建分享，使用当前消息/分享幂等语义。
- `DELETE /api/session/sessions/{session_id}/share` 撤销分享；当前 receipt 以 session 为边界。
- share receipt 只返回 opaque `share_id` 和可分享 URL；不返回 tenant、内部 actor 或权限判定细节。

## 5. 统一错误

```json
{
  "error": {
    "code": "capability.disabled",
    "message": "This capability is not enabled.",
    "request_id": "req_123",
    "retryable": false,
    "details": {}
  }
}
```

稳定错误码至少包括：`auth.required`、`auth.forbidden`、`request.invalid`、`resource.not_found`、`capability.disabled`、`idempotency.conflict`、`rate_limited`、`run.failed`、`credit.insufficient`。

## 6. 前端映射

| 契约 | shadcn/Radix 视图 |
| --- | --- |
| `runtime-manifest` | `Sidebar`, `SidebarMenu`, `Tooltip`, `Skeleton` |
| `workspace/context` | `Card`, `Separator`, `Empty`, `Alert`, `Sheet` |
| `composer-catalog` | `Textarea`, `Button`, `DropdownMenu`, `Popover` |
| session events | `Message`, `Badge`, `Alert`, `Collapsible`, `ScrollArea` |
| share | `Popover`, `AlertDialog`, `Button` |
| projects/context | `ResizablePanelGroup`, `Card`, `Tabs`, `Dialog` |
