# Kokoro User Web BFF Contract v3

状态：后端 Web Agent 与 User Web 的权威资源/API 集成契约。发布日期：2026-08-28。

> 域名转发与服务间认证以 [`forwarded-context-contract-v1.md`](./integration/forwarded-context-contract-v1.md)
> 为准：Web BFF 使用服务端 `KOKORO_DOMAIN` 生成 RFC 7239 `Forwarded`，不发送自定义
> `X-Domain`。本文中涉及 Host → tenant 的旧措辞均应理解为“受信 BFF 的 Forwarded authority
> → deployment binding”，不得把浏览器 Host、Forwarded 或任意 tenant 字段当成认证凭据。

本契约借鉴 Manus API v2 的资源边界、异步任务生命周期、游标分页和统一响应信封；不要求
后端兼容 Manus URL，也不把 Manus API Key、OAuth token 或服务端 webhook 暴露给浏览器。

## 1. 不可变边界

1. 浏览器只调用当前站点的同源 `/api/*` BFF。
2. BFF 根据受信 deployment context（服务端 `KOKORO_DOMAIN` 生成的 `Forwarded`）和 httpOnly session envelope 解析租户与用户，浏览器不提交或接收
   `tenant_id`、`site_id`、IAM token、workload token。
3. `project_id`、`task_id`、`message_id`、`file_id` 等均为不透明资源 ID。它们可出现在 URL
   和响应中，但不是租户隔离键；服务端必须在当前 tenant context 内再次鉴权。
4. 直接任务与专案任务是同一种 Task 资源的两种 scope。专案不是会话，项目内可以创建多个任务。
5. 列表只返回导航摘要；详情、消息事件、文件和成果分别加载。
6. 所有写操作接收 `Idempotency-Key`。相同 actor、route、key 和等价 payload 必须返回同一
   receipt；同 key 不同 payload 返回 `409 idempotency.conflict`。

## 2. 统一响应信封

单资源成功：

```json
{
  "ok": true,
  "request_id": "req_123",
  "data": { "id": "task_123" }
}
```

列表成功：

```json
{
  "ok": true,
  "request_id": "req_123",
  "data": [],
  "has_more": false,
  "next_cursor": null
}
```

失败：

```json
{
  "ok": false,
  "request_id": "req_123",
  "error": {
    "code": "request.invalid",
    "message": "The request is invalid.",
    "retryable": false,
    "details": {}
  }
}
```

- HTTP status 表达协议结果，`error.code` 表达稳定业务原因，`message` 只用于兜底显示。
- `request_id` 必须同时写入服务端日志，可通过 `x-request-id` 响应头回传。
- `next_cursor` 由服务端签名或加密，客户端不得解析、修改或自行生成。
- 最小错误码：`auth.required`、`auth.forbidden`、`request.invalid`、`resource.not_found`、
  `capability.disabled`、`idempotency.conflict`、`rate_limited`、`task.conflict`、
  `task.failed`、`credit.insufficient`、`upload.expired`、`upload.rejected`。

## 3. 资源模型

```text
Workspace
  ├── Project 0..n
  │     ├── shared instruction
  │     ├── connector/skill/file defaults
  │     └── Task 0..n
  └── Direct Task 0..n

Task
  ├── Message/Event 1..n
  ├── Run 1..n
  ├── File reference 0..n
  └── Artifact 0..n
```

### 3.1 Task 状态

服务端权威状态：

```text
queued -> running -> waiting -> running -> completed
                    |                    -> failed
                    -> cancelled
```

允许值：`queued`、`running`、`waiting`、`completed`、`cancelled`、`failed`。

- `waiting` 必须携带 pending action，不能只靠按钮或文案推断。
- `completed` 与 `cancelled` 分开，避免 Manus `stopped` 同时表示完成和停止的歧义。
- 客户端不根据 SSE 断开、颜色或最后一条消息猜状态；快照与事件投影是唯一事实来源。

## 4. 浏览器 BFF 路径

### 4.1 启动与当前用户

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/system/runtime-manifest?locale=...` | Kokoro User Web 的站点皮肤、导航、i18n、能力投影；BFF 固定 `product_id=kokoro`、`surface_id=user-web` |
| GET | `/api/auth/session` | 当前登录态与最小 actor projection |
| POST | `/api/auth/logout` | 注销当前站点 session |
| GET | `/api/settings/account` | 当前 actor 的账户、套餐摘要和登录方式 projection |
| PATCH | `/api/settings/account` | 更新当前 actor 的显示名称 |
| POST | `/api/settings/account/email-verifications` | 向当前邮箱发送更改邮箱验证码 |
| PATCH | `/api/settings/account/email` | 验证旧邮箱验证码并更新新邮箱 |
| GET | `/api/settings/account/login-methods` | Google/Microsoft/Apple 与 Passkey 状态 |
| POST | `/api/settings/account/login-methods/{provider}/connect` | 发起 allowlisted OAuth 连接流程 |
| DELETE | `/api/settings/account/login-methods/{provider}` | 解除登录方式；服务端保证仍有可用登录方式 |
| POST | `/api/settings/account/passkeys/options` | 创建 WebAuthn registration options |
| POST | `/api/settings/account/passkeys` | 校验 attestation 并登记 Passkey |
| POST | `/api/settings/account/deletion-verifications` | 发送删除账户验证码 |
| DELETE | `/api/settings/account` | 验证验证码并进入账户删除流程 |
| GET | `/api/workspace/context` | 当前 workspace 摘要与启用模块 |
| GET | `/api/composer/catalog?project_id=...` | 模型、模式、Agent、技能、连接器可选项 |

actor projection 只返回 UI 必需字段；禁止返回内部 subject、tenant binding、权限计算过程或 token。

账户设置 projection 示例：

```json
{
  "displayName": "Preview User",
  "email": "user@example.com",
  "userId": "usr_123",
  "planLabel": "Free",
  "credits": "1000",
  "freeCredits": "1000",
  "dailyCredits": "300",
  "dailyRefreshText": "Refreshes to 300 every day at 00:00",
  "loginMethods": [
    { "id": "google", "label": "Google", "account": "user@example.com", "connected": true }
  ]
}
```

- `userId` 是可展示的不透明 actor ID，不是 tenant key；浏览器仍不提交或接收可信 `tenant_id`。
- 邮箱变更和账户删除验证码使用短 TTL、单次消费、失败次数限制与发送频率限制；响应不回显验证码。
- 登录方式 OAuth URL 必须来自服务端 allowlist，并绑定 Host、actor、state、PKCE 和短时 nonce。
- 解除登录方式前必须确认账户仍保留至少一种可用登录方式，避免把用户锁在账户外。
- Passkey 使用标准 WebAuthn challenge；challenge 单次使用并绑定当前 Host RP ID、actor 与 session。
- 删除账户先进入服务端宽限/清理流程；幂等重放返回同一 receipt，订阅状态由计费服务再次确认。

### 4.2 Project

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/projects?limit=20&cursor=...&order=desc` | 专案列表 |
| POST | `/api/projects` | 创建专案 |
| GET | `/api/projects/{project_id}` | 专案详情与默认上下文 |
| PATCH | `/api/projects/{project_id}` | 名称、指令和允许更新的默认项 |
| GET | `/api/projects/{project_id}/instruction-revisions` | 专案指令版本历史，按更新时间倒序返回 |
| DELETE | `/api/projects/{project_id}` | 删除专案 |
| POST | `/api/projects/{project_id}/resources` | 以 multipart `files[]` 添加项目文件资源 |
| PATCH | `/api/projects/{project_id}/skills/{skill_name}` | 启用或停用项目技能绑定 |
| GET | `/api/projects/{project_id}/websites` | 当前专案可绑定的网站目录与已选状态 |
| PUT | `/api/projects/{project_id}/websites` | 幂等替换专案网站绑定，body 为 `website_ids[]` |
| GET | `/api/projects/{project_id}/scheduled-tasks` | 当前专案的排程任务目录 |
| POST | `/api/projects/{project_id}/scheduled-tasks` | 在专案上下文中创建排程任务 |

Project 最小模型：

```json
{
  "id": "project_123",
  "name": "Launch research",
  "instruction": "Use concise evidence-backed answers.",
  "created_at": "2026-08-28T12:00:00Z",
  "updated_at": "2026-08-28T12:00:00Z",
  "capabilities": {
    "instructions": true,
    "connectors": true,
    "files": true,
    "skills": true,
    "schedules": false
  }
}
```

专案指令历史响应：

```json
{
  "ok": true,
  "request_id": "req_123",
  "data": [
    {
      "id": "project_instruction_revision_123",
      "instruction": "Use concise evidence-backed answers.",
      "updated_at": "2026-08-29T22:36:00.000Z",
      "current": true,
      "actor": {
        "id": "usr_123",
        "display_name": "Preview User"
      }
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

- `GET /api/projects/{project_id}/instruction-revisions` 按 `updated_at desc, id desc` 稳定排序；第一项
  必须是当前版本并带 `current: true`，其余项为 `false`。
- `actor.id` 是当前租户内的不透明 actor ID；UI 只展示 `actor.display_name`，不把品牌名当作作者。
- `PATCH /api/projects/{project_id}` 更新 `instruction` 成功时必须原子创建 revision，并在响应的
  `data.revision` 返回同一 revision projection；相同 `Idempotency-Key` 重放不得产生重复版本。
- `updated_at` 使用带时区的 ISO 8601。浏览器按当前 locale 格式化日期，不提交时区、actor 或
  tenant 字段。

创建排程任务：

```json
{
  "title": "Daily briefing",
  "prompt": "Summarize unread messages and highlight important items.",
  "frequency": "daily",
  "time": "08:00",
  "expiresAt": null,
  "autoApprove": false
}
```

- BFF 根据受信 `Forwarded` authority、session 与路由中的 `project_id` 推导 tenant context；body 不接受 `tenant_id`。
- `time` 使用 workspace 时区解释，服务端响应必须同时返回规范化时区和下一次执行时间。
- `frequency` 初版为 `daily | weekly`；后续 cron 表达式只进入服务端模型，不直接信任浏览器字符串。
- 创建请求使用 `Idempotency-Key`；同键重放返回同一任务，避免双击产生重复排程。

### 4.3 Task

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/tasks?scope=direct&limit=20&cursor=...&order=desc` | 直接任务 |
| GET | `/api/tasks?scope=project&project_id=project_123&limit=20&cursor=...` | 专案内任务 |
| POST | `/api/tasks` | 创建异步任务 |
| GET | `/api/tasks/{task_id}` | 状态与元数据，不包含完整消息 |
| PATCH | `/api/tasks/{task_id}` | 重命名等轻量元数据更新 |
| DELETE | `/api/tasks/{task_id}` | 软删除任务 |
| POST | `/api/tasks/{task_id}/messages` | 继续当前多轮任务 |
| POST | `/api/tasks/{task_id}/cancel` | 取消当前活动 Run |

创建直接任务：

```json
{
  "scope": "direct",
  "message": {
    "content": [{ "type": "text", "text": "Build a launch checklist" }],
    "file_ids": [],
    "connector_ids": [],
    "skill_ids": []
  },
  "execution": {
    "mode": "fast",
    "model_id": "model_default",
    "agent_id": "agent_default"
  }
}
```

创建专案任务仅增加：

```json
{
  "scope": "project",
  "project_id": "project_123"
}
```

创建 receipt：

```json
{
  "ok": true,
  "request_id": "req_123",
  "data": {
    "task_id": "task_123",
    "run_id": "run_123",
    "status": "queued",
    "resolved_execution": {
      "mode": "fast",
      "model_id": "model_default",
      "agent_id": "agent_default"
    }
  }
}
```

专案归属在任务创建后不可由普通 PATCH 修改。要移动任务必须使用独立命令并重新鉴权；首版不开放。

### 4.4 消息、事件与实时更新

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/tasks/{task_id}/messages?limit=50&cursor=...&order=asc&verbose=false` | 可分页历史 |
| GET | `/api/tasks/{task_id}/events` | 当前任务 SSE 增量流 |
| POST | `/api/tasks/{task_id}/actions/{action_id}` | 回答问题、确认或拒绝动作 |

消息/事件使用带 `type` 的 discriminated union，最小类型：

```text
user_message
assistant_message
status_update
plan_update
tool_update
artifact_created
action_required
action_resolved
error
```

SSE 每帧：

```text
id: 184
event: task.event
data: {"task_id":"task_123","seq":184,"type":"status_update","payload":{"status":"running"},"created_at":"2026-08-28T12:00:01Z"}
```

- `seq` 在单个 task 内严格递增，等于 SSE `id`。
- 重连携带 `Last-Event-ID`；服务端从下一条事件续传。
- 服务端无法续传时返回 `409 stream.cursor_expired`，客户端重新拉取 task detail 与消息历史后再连接。
- SSE 是浏览器实时通道；webhook 只用于服务到服务集成，不进入 User Web 状态机。

### 4.5 File 与 Artifact

| Method | Path | 用途 |
| --- | --- | --- |
| POST | `/api/files/uploads` | 创建上传记录和短时上传 URL |
| GET | `/api/files/{file_id}` | 查询上传/扫描状态 |
| DELETE | `/api/files/{file_id}` | 删除尚未绑定或允许删除的文件 |
| GET | `/api/artifacts?task_id=...&limit=20&cursor=...` | 任务成果列表 |
| GET | `/api/artifacts/{artifact_id}/download` | 经 BFF 授权后下载或 302 到短时签名 URL |

采用 Manus 的两阶段上传思路：先创建 file record，再上传二进制，最后通过 `file_id` 绑定任务。
上传 URL 必须短时有效、限制 method/content length/content type；完成后还要经过扫描与 tenant-scope
校验。浏览器不能把任意外部 URL 当作已授权文件。

### 4.6 Skills、Connectors 与 Agents

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/skills?project_id=...` | 全局技能与专案技能目录 |
| GET | `/api/connectors?project_id=...` | 当前用户已授权且专案可用的连接器 |
| GET | `/api/agents` | 当前站点可用 Agent |

这些接口返回“可选目录”，不返回密钥、OAuth refresh token、MCP 凭据或内部 endpoint。任务 receipt
必须回显服务端最终解析的 ID，防止客户端把已失效的本地选项当作执行事实。

### 4.7 Settings

| Method | Path | 用途 |
| --- | --- | --- |
| GET/PATCH | `/api/settings/preferences` | 语言、主题、通知和广告偏好 |
| GET/PATCH | `/api/settings/personalization` | 昵称、职业、个人资料、自订指令和知识摘要 |
| GET | `/api/settings/usage?scope=websites&period=current` | 网站免费额度、付费用量、周期与网站费用 projection |
| GET | `/api/settings/usage?scope=computer&period=current` | 云电脑创建入口和当前 actor 的云电脑 projection |
| GET/PATCH | `/api/settings/shortcuts` | 用户快捷键覆盖 |
| GET | `/api/settings/connectors` | 连接器管理视图 projection |
| GET | `/api/settings/connectors/catalog?category=app&query=&limit=40&cursor=` | 连接器目录、搜索与游标分页 |
| POST | `/api/settings/connectors/{connector_id}/install` | 发起 OAuth/API 授权或安装流程 |
| DELETE | `/api/settings/connectors/{connector_id}/install` | 移除当前 actor 的连接器授权 |
| POST | `/api/settings/connectors/custom-mcp` | 创建自订 MCP，支持描述、图示和 secret-backed headers |
| POST | `/api/settings/connectors/custom-mcp/import-json` | 校验并汇入单个 MCP JSON 配置 |
| POST | `/api/settings/connectors/custom-mcp/inspect-url` | 检查 URL、推导名称/传输类型，返回可确认草稿 |
| GET | `/api/settings/skills?scope=all&query=&limit=40&cursor=` | 当前 actor 已新增技能及启停状态 |
| GET | `/api/settings/skills/catalog?scope=official&query=&limit=40&cursor=` | 可发现技能目录 |
| PUT | `/api/settings/skills/{skill_id}/enabled` | 幂等启用或停用，body 为 `{ "enabled": true }` |
| POST | `/api/settings/skills/uploads/preview` | 上传 zip 并返回候选技能、冲突与校验结果 |
| POST | `/api/settings/skills/uploads/confirm` | 确认发布已通过预检的候选技能 |
| POST | `/api/settings/skills/imports/github` | 校验并导入 GitHub 技能来源 |
| POST | `/api/settings/skills/generate` | 创建 AI 技能生成任务并返回 `task_id` |
| GET | `/api/settings/data-management` | 数据管理总览 projection：分享、封存、授权应用与云端浏览器数据 |
| PATCH | `/api/settings/data-management/cloud-browser` | 幂等设置跨任务保持登录，body 为 `{ "persist_sign_in": true }` |
| DELETE | `/api/settings/data-management/authorized-apps/{app_id}` | 撤销当前 actor 对应用的授权 |
| DELETE | `/api/settings/data-management/cloud-browser/sites/{site_id}` | 删除一个网站的 Cookie 与云端浏览器数据 |
| POST | `/api/settings/data-export` | 创建异步数据导出任务 |
| GET | `/api/settings/cloud-computers` | 当前 actor 的云电脑列表与运行状态 |
| GET | `/api/settings/cloud-computers/plans` | 可购买方案、地区、额度和储存规格目录 |
| POST | `/api/settings/cloud-computers` | 创建云电脑，body 为方案、名称、地区和储存规格 |
| GET | `/api/settings/mail` | 当前 actor 的任务邮箱、工作流邮箱与授权发件人 projection |
| POST | `/api/settings/mail/workflows` | 创建工作流邮箱，body 为 `{ "slug", "instruction" }` |
| DELETE | `/api/settings/mail/workflows/{workflow_id}` | 删除当前 actor 的工作流邮箱 |
| POST | `/api/settings/mail/authorized-senders` | 新增授权发件人，body 为 `{ "email" }` |
| DELETE | `/api/settings/mail/authorized-senders/{sender_id}` | 删除授权发件人 |
| GET | `/api/settings/mail/inbox?cursor=&limit=50` | 兼容 v3 的收件匣 projection；新实现以 v4 `/api/mail/inbox` 为准 |
| GET | `/api/settings/deployments` | 当前 actor 的网站、应用和已购买域名 projection |
| POST | `/api/settings/deployments/websites` | 建立网站任务，返回 `task_id` 与草稿 deployment |
| POST | `/api/settings/deployments/apps` | 建立应用任务，返回 `task_id` 与草稿 deployment |
| POST | `/api/settings/domains/purchase-intents` | 创建域名购买意向并返回确认/结账信息 |
| GET | `/api/settings/integrations` | Zapier、Slack、Telegram、LINE 的目录与当前连接状态 |
| GET | `/api/settings/integrations/{integration_id}` | 整合详情、能力、说明和可用动作 |
| POST | `/api/settings/integrations/{integration_id}/connect` | 发起 OAuth、Bot 或外部安装流程 |
| DELETE | `/api/settings/integrations/{integration_id}/connect` | 解除当前 actor 的整合绑定 |
| GET | `/api/settings/developer/api-keys` | API Key 摘要列表，不返回完整 secret |
| POST | `/api/settings/developer/api-keys` | 创建 API Key；完整 secret 仅在本次响应出现 |
| DELETE | `/api/settings/developer/api-keys/{key_id}` | 吊销当前 actor 可管理的 API Key |
| GET | `/api/settings/developer/webhooks` | Webhook 端点、事件范围与状态列表 |
| POST | `/api/settings/developer/webhooks` | 创建 Webhook；签名 secret 仅在本次响应出现 |
| PATCH | `/api/settings/developer/webhooks/{webhook_id}` | 更新 URL、事件范围或启停状态 |
| DELETE | `/api/settings/developer/webhooks/{webhook_id}` | 删除 Webhook |
| POST | `/api/settings/developer/webhooks/{webhook_id}/rotate-secret` | 轮换签名 secret；新值仅返回一次 |

`GET /api/settings/preferences` 返回当前 actor 的完整 projection：

```json
{
  "data": {
    "locale": "zh",
    "theme": "system",
    "browser_notifications": false,
    "sound_notifications": false,
    "product_updates": true,
    "brand_ads": true,
    "version": 7
  }
}
```

`PATCH /api/settings/preferences` 接受上述偏好字段的非空子集，通知开关按单字段幂等更新，例如
`{ "sound_notifications": true }`。成功返回更新后的完整 projection；并发写入可用 `version` 做
乐观并发控制。`sound_notifications=true` 要求 `browser_notifications=true`，否则返回
`409 preference_dependency_unsatisfied`。Web 使用乐观更新，非 `2xx` 时回滚到提交前状态。

用量接口按 `scope` 返回窄 projection，不返回其他设置页面的数据。金额使用十进制字符串表达最小货币
单位，时间使用带时区的 ISO 8601；前端按 UTC 日历日期展示周期边界，避免部署节点时区造成日期减一天。

```json
{
  "auto_top_up_enabled": false,
  "reset_at": "2026-09-01T00:00:00.000Z",
  "period_start": "2026-08-01T00:00:00.000Z",
  "period_end": "2026-08-29T00:00:00.000Z",
  "total_cost_minor": "0",
  "categories": [
    {
      "key": "cloud",
      "label": "Cloud services",
      "free_used_minor": "0",
      "free_limit_minor": "1000",
      "paid_minor": "0"
    }
  ],
  "websites": [],
  "computers": []
}
```

`categories[].key` 只允许 `cloud | ai | integration`，Web 使用 key 本地化分类名，`label` 仅作为未知
版本的回退文案。`scope=websites` 必须返回三个类别；`scope=computer` 可省略网站类别内容，但仍返回
同一稳定 envelope。自动充值的开启属于独立写操作，不能通过 GET 或前端本地状态隐式生效。

浏览器请求体不得出现 `tenant_id`、`site_id`、`user_id` 或 namespace。BFF 从域名解析 tenant，
从密封会话解析 actor，并将可信身份注入到 Hub/System 的内部请求头。服务端必须忽略或拒绝浏览器
伪造的身份字段，不以客户端提交值参与隔离裁决。

不存在后端数据时返回 `null` 或明确 capability disabled；前端显示 `—` 或禁用态，不伪造邮箱、
用户 ID、积分、余额、套餐和日期。

个性化 projection：

```json
{
  "nickname": null,
  "occupation": null,
  "about": null,
  "instructions": null,
  "knowledge_count": 0,
  "version": 1
}
```

Mail projection 由服务端生成完整邮箱地址；浏览器只提交 slug 和指令，不提交可覆盖的邮箱域名、
actor id 或可信 `tenant_id`：

```json
{
  "mailbox": "member@SITE_MAIL_DOMAIN",
  "workflows": [
    {
      "id": "mail_workflow_123",
      "address": "member-newsletter@SITE_MAIL_DOMAIN",
      "slug": "newsletter",
      "instruction": "整理每日简报",
      "created_at": "2026-08-29T00:00:00Z"
    }
  ],
  "authorized_senders": [
    {
      "id": "mail_sender_123",
      "email": "owner@example.com",
      "created_at": "2026-08-29T00:00:00Z"
    }
  ],
  "version": 1
}
```

- `slug` 由后端按站点策略校验、规范化并检查唯一性；冲突返回 `409 mail.workflow_slug_conflict`。
- 发件人邮箱由后端规范化大小写并验证格式；重复提交返回现有资源 projection，保持幂等。
- 删除接口只接受服务端资源 ID，不接受邮箱字符串作为资源定位键。
- 邮件内容、附件与收件任务不包含在设置 projection；收件匣使用独立、游标分页的任务资源接口。

部署 projection 只返回当前 actor 可管理的发布资源，不包含云厂商密钥、DNS provider token、构建机
凭据或内部部署地址：

```json
{
  "websites": [],
  "apps": [],
  "domains": [],
  "capabilities": {
    "create_website": true,
    "create_app": true,
    "purchase_domain": true
  },
  "version": 1
}
```

- 网站与应用创建是异步任务；响应使用任务 receipt，后续状态通过任务快照/SSE 更新。
- 域名购买必须经过服务端可用性与价格复核；浏览器展示的候选价格不是最终计费事实。
- 受信 `Forwarded` authority、session 与 actor context 决定租户范围，body 不接受可信 `tenant_id`、部署 namespace 或
  DNS account id。

整合连接接口返回同源可确认结果或短时授权 URL：

```json
{
  "integration": {
    "id": "slack",
    "status": "not_connected",
    "capabilities": ["task.create", "task.status.read"]
  },
  "authorization_url": "https://PROVIDER/authorize?state=OPAQUE_STATE",
  "expires_at": "2026-08-29T01:15:00Z"
}
```

- `authorization_url` 必须来自服务端 allowlist，不接受浏览器提交的 callback/redirect URL。
- OAuth state、bot token、webhook secret 和 provider credential 不进入浏览器 projection 或日志。
- Zapier 外部目录可以是公开链接；任何包含用户邮箱、姓名或模板签名参数的 URL 必须由后端短时生成，
  不得硬编码到 User Web。
- 重复连接返回当前状态；解除绑定按 actor membership 与受信 `Forwarded` deployment context 做资源隔离。

PATCH 只接受上述四个可编辑文本字段和 `version`；知识导入使用独立异步任务，不允许浏览器把其他
供应商的 token、Cookie 或完整会话直接写入个人资料接口。BFF 根据 session actor 和 Host 绑定
隔离数据，body 不接受可信 `tenant_id`。

云电脑方案价格和规格必须由服务端目录返回，浏览器展示值不构成计费依据。创建接口要求
`Idempotency-Key`，服务端重新校验方案、余额、配额和区域容量后返回异步 provisioning 状态；
浏览器不提交云厂商凭据、内部实例类型或可信 `tenant_id`。

连接器目录响应使用稳定资源模型，不让 Web 组件依赖某个参考站点的私有接口：

```json
{
  "data": [
    {
      "id": "connector_gmail",
      "category": "app",
      "name": "Gmail",
      "description": "撰写邮件，搜索会话并快速生成摘要",
      "icon_url": "/assets/connectors/gmail.webp",
      "install_state": "available",
      "auth_kind": "oauth2",
      "project_publishable": false
    }
  ],
  "next_cursor": null
}
```

- `category` 为 `app | custom_api | custom_mcp | project`；目录 tab 与该值一一对应。
- `install_state` 为 `available | pending | installed | error`，按钮状态由服务端事实驱动。
- `icon_url` 只允许同源路径或 System 配置允许的 HTTPS 资源；User Web 自带的 fixture 图标位于
  `/assets/connectors/`，正式数据可由后端覆盖。
- `POST .../install` 返回 `{ "data": { "state": "pending", "authorize_url": "..." } }` 或
  已完成的 `{ "data": { "state": "installed" } }`；`authorize_url` 必须经过 BFF allowlist 校验。
- API key、OAuth access/refresh token、MCP secret、内部 callback 与 provider endpoint 永不出现在目录响应中。

自订 MCP 创建体使用可持久化字段，不允许前端展示提交后会丢失的假配置：

```json
{
  "name": "my-custom-server",
  "transport": "streamable_http",
  "url": "https://mcp.example.com/mcp",
  "description": "何时以及如何使用这个 MCP",
  "icon_file_id": "file_icon_01",
  "allowed_tools": [],
  "headers_secret_ref": "handle:srt_01"
}
```

- `description`、`icon_file_id` 可为 `null`；图示文件必须经过同租户文件授权和图片类型/尺寸校验。
- 自订 header 的名称和值不得直接进入普通 JSON、日志或响应。浏览器通过 secret broker 创建一次性 secret，
  创建体只提交 `headers_secret_ref`；详情接口只返回 `has_custom_headers`。
- `import-json` 只接受受限 MCP 配置结构，拒绝本地命令、文件路径、内嵌凭据、私网 URL 和未知字段；
  返回规范化草稿，确认后再调用 `custom-mcp`。
- `inspect-url` 不代表安装成功，只返回规范化草稿与校验错误；最终创建必须携带 `Idempotency-Key`。

技能管理响应使用同一稳定 projection，设置页与技能浏览弹窗不得分别猜测字段：

```json
{
  "items": [
    {
      "id": "skill_typst_pdf",
      "name": "Typst PDF 制作工具",
      "description": "使用 Typst 生成专业、高品质的 PDF 文件。",
      "scope": "official",
      "installed": true,
      "enabled": true,
      "updated_at": "2026-08-28T00:00:00Z"
    }
  ],
  "next_cursor": null
}
```

- `scope` 为 `personal | official | third_party`，与设置页四个筛选项一一对应。
- `installed` 决定技能浏览弹窗显示加号还是完成标记；`enabled` 决定已新增目录中的开关状态。
- 已停用技能仍保留在 `/api/settings/skills`，否则用户无法从同一页面重新启用。
- `updated_at` 是服务端资源更新时间，不由浏览器使用当前时间伪造。
- 启停接口同值重复提交时返回当前 projection，不返回空响应后让前端猜测状态。
- BFF 从受信 `Forwarded` authority、session 和 actor context 解析租户；query、path 和 body 均不接受可信 `tenant_id`。

数据管理总览必须是账户设置 projection，不复用 Artifact Library。空列表返回 `[]`，保持登录状态返回
真实布尔值；浏览器不根据 UI 空状态猜测授权或 Cookie 状态：

```json
{
  "ok": true,
  "request_id": "req_123",
  "data": {
    "shared_tasks": [],
    "shared_files": [],
    "archived_tasks": [],
    "authorized_apps": [],
    "cloud_browser": {
      "persist_sign_in": false,
      "sites": []
    }
  }
}
```

- `shared_tasks` 项包含 `id/title/shared_at`；`shared_files` 包含 `id/name/media_type/shared_at`；
  `archived_tasks` 包含 `id/title/archived_at`。
- `authorized_apps` 项包含 `id/name/description/authorized_at`；不返回 OAuth token、scope secret、
  callback secret 或 provider credential。
- `cloud_browser.sites` 项只返回 `id/domain/last_used_at`；Cookie 值、session token 和浏览器存储内容
  永不返回 User Web。
- PATCH 以服务端回传的 `persist_sign_in` 为最终状态；失败时前端回滚乐观更新。

Developer 设置使用独立资源，不复用连接器凭据。API Key 创建响应示例：

```json
{
  "ok": true,
  "request_id": "req_123",
  "data": {
    "id": "key_123",
    "name": "CI key",
    "prefix": "kk_live_ab12",
    "secret": "kk_live_ab12_example-secret",
    "created_at": "2026-08-29T00:00:00Z",
    "expires_at": null,
    "status": "active"
  }
}
```

- `secret` 只在创建成功的单次响应出现；列表、详情、日志、审计事件和后续错误均不得再次返回。
- Key 列表只返回 `id/name/prefix/created_at/expires_at/last_used_at/status`。`prefix` 用于识别，不足以认证。
- 创建与轮换必须携带 `Idempotency-Key`；同键重放返回同一 receipt，不生成第二个 secret。
- Key 授权范围由服务端 capability policy 决定；浏览器不得提交内部 role、actor 或可信 `tenant_id`。

Webhook 创建/轮换响应可以返回一次性 `signing_secret`，其他读取接口只返回
`has_signing_secret: true`。端点模型包含 `id/url/events/status/created_at/updated_at/last_delivery`，其中
`last_delivery` 只含状态、时间、HTTP status 与 request id，不含目标响应正文或敏感 header。

- URL 仅接受 HTTPS；解析后拒绝 loopback、link-local、私网、云 metadata、非标准编码 IP 和 DNS rebinding。
  每次投递前必须重新解析并执行同一 egress policy，不以创建时校验代替投递时校验。
- 投递使用 HMAC-SHA256，至少包含 timestamp、event id 和原始 body；接收方可用固定时间比较验签。
- `event_id` 全局唯一，timestamp 超过容忍窗口拒绝；重试沿用同一 event id，避免接收方重复处理。
- 非 2xx 采用有上限的指数退避并加入 jitter；`410` 或连续永久失败可自动停用，状态变化记录审计事件。
- Webhook payload 只包含当前 tenant context 内允许公开的 projection，不发送 IAM token、内部 subject、
  provider credential、完整 API Key 或可信 `tenant_id`。

### 4.8 自订 MCP Connector v2

Settings 的连接器创建器使用两阶段写入。图标先上传，创建请求只携带不透明 `asset_id`；自订
header 的值为只写 secret，后端必须在落库前加密，任何读取 projection 都只返回 header 名称与
`has_value`，不返回原值、密文、环境变量名或 secret handle。

```http
POST /api/hub/self/connectors/assets
Content-Type: multipart/form-data
Idempotency-Key: ...
```

字段 `file` 仅接受 PNG/JPEG，最大 `1 MiB`，解码后再次验证 MIME、像素和文件头，建议尺寸
`256×256`。成功响应：

```json
{
  "data": {
    "asset_id": "asset_opaque",
    "url": "/api/hub/self/connectors/assets/asset_opaque"
  },
  "requestId": "req_123"
}
```

```http
POST /api/hub/self/connectors/mcp
Content-Type: application/json
Idempotency-Key: ...
```

```json
{
  "name": "custom-search",
  "transport": "http",
  "endpoint_url": "https://mcp.example.test/mcp",
  "icon_asset_id": "asset_opaque",
  "instructions": "Use this connector for research tasks.",
  "headers": [
    { "name": "Authorization", "value": "Bearer WRITE_ONLY" }
  ],
  "enabled": true
}
```

- `name` 为当前 tenant 内唯一的稳定 slug；显示标题后续单独扩展，不使用名称承担租户隔离。
- `endpoint_url` 仅接受 HTTPS，并执行与 Webhook 相同的 SSRF、DNS rebinding 和 egress policy。
- header 名称按 RFC token 收敛，拒绝 `Host`、`Content-Length`、hop-by-hop 和代理认证 header；
  名称大小写归一后不得重复。
- header `value` 不进入日志、错误 details、审计 diff、缓存 key 或响应。更新时使用替换语义，空值不代表
  “保留原值”；保留与清除必须使用显式操作。
- 创建结果进入既有 `/self/mcp/servers` projection，浏览器通过失活重取观察最终状态。
- 两个请求都不接受或返回 `tenant_id/site_id/user_id`；BFF 从可信信封注入内部 tenant context。

## 5. 缓存与并发

- `runtime-manifest`：私有响应，`ETag` + `Cache-Control: private, max-age=60`；Host binding 变化必须换 ETag。
- actor、workspace、settings：`private, no-cache`，允许 ETag 重验证。
- task/project 列表与详情：`private, no-store`；前端 Query cache 只做内存去重。
- PATCH 接受 `If-Match` 或 body `version`；冲突返回 `409 resource.version_conflict` 和最新 version。
- `POST /api/tasks`、发送消息、action、上传、分享、导出和删除必须使用 `Idempotency-Key`。
- `429` 返回 `Retry-After`；客户端只自动重试标记为 `retryable=true` 的幂等请求。

## 6. 鉴权与租户隔离

服务端处理顺序固定：

```text
受信 Web BFF 服务身份
  -> Forwarded authority allowlist
  -> domain-to-tenant binding
  -> signed httpOnly session
  -> actor membership
  -> capability/permission check
  -> tenant-scoped resource lookup
  -> response projection
```

- 不接受 `X-Domain`、`x-tenant-id`、query/body `tenant_id` 或 localStorage 值作为信任来源；`Forwarded` 只有在 BFF 已通过服务间认证后才可使用。
- 同一个邮箱在两个租户中是两个 membership；资源查询必须同时受 tenant context 和 actor membership 限制。
- 对跨租户或无权限资源统一返回 `404 resource.not_found`，不泄露资源是否存在。
- BFF 调用 IAM/System/Session 时使用服务身份和内部签名信封；这些凭据不得下发浏览器。

## 7. Manus 对照决策

| Manus v2 公开模式 | Kokoro 决策 |
| --- | --- |
| `task.create/detail/list/listMessages/sendMessage` | 采用 Task 资源与多轮消息边界，改为 RESTful 同源 BFF 路径 |
| `scope=standard/project` + `project_id` | 采用 `scope=direct/project`，专案与直接任务列表严格分开 |
| 异步 task + polling/webhook | 浏览器使用快照 + SSE；服务到服务可另接 webhook |
| `ok/request_id/error` | 采用，并补 `retryable/details` |
| `limit/cursor/order/has_more/next_cursor` | 采用 |
| file record + presigned upload URL | 采用两阶段上传，增加扫描和 tenant-scope 校验 |
| skill/connector/agent 独立目录 | 采用资源目录，凭据永不进入浏览器 |
| API key / OAuth access token | 不用于 User Web 浏览器；由同源 BFF session 取代 |
| Manus `running/stopped/waiting/error` | 细化为 Kokoro 六态，保留明确完成/取消语义 |

## 8. 后端 Agent 验收标准

1. Contract tests 覆盖成功/失败 envelope、游标、幂等重放和版本冲突。
2. 直接任务查询绝不返回 `project_id` 非空任务；专案查询只返回完全匹配项目的任务。
3. 篡改 Host、资源 ID、cursor、project_id 均不能跨租户读取或写入。
4. 浏览器请求与响应、HTML、日志和 localStorage 中不出现 tenant/site/token。
5. SSE 断线后从 `Last-Event-ID` 续传且不重复渲染；cursor 过期可通过快照恢复。
6. 上传 URL 过期、超限、类型拒绝、扫描失败和跨租户 file_id 均有稳定错误码。
7. 未提供账户或计费数据时返回空值，不制造展示数据。
8. 所有 endpoint 都返回可关联的 `request_id`，且错误响应不泄露内部堆栈、SQL、Redis key 或私有 URL。

## 9. 参考资料

- [Manus API v2 Introduction](https://open.manus.im/docs/v2/introduction)
- [Manus task.list](https://open.manus.im/docs/v2/task.list)
- [Manus task.detail](https://open.manus.im/docs/v2/task.detail)
- [Manus task.listMessages](https://open.manus.im/docs/v2/task.listMessages)
- [Manus Task Lifecycle](https://open.manus.im/docs/v2/task-lifecycle)
- [Manus project.list](https://open.manus.im/docs/v2/project.list)
- [Manus file.upload](https://open.manus.im/docs/v2/file.upload)
- [Manus skill.list](https://open.manus.im/docs/v2/skill.list)
- [Manus connector.list](https://open.manus.im/docs/v2/connector.list)
- [Manus Webhook Security](https://open.manus.im/docs/v2/webhooks-security)
