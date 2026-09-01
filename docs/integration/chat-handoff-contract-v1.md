# Chat 承接契约 v1

> 本文只描述 `kokoro-app` 内部 Direct Chat 与 Project Chat 的浏览器承接边界。
> 它不引入新的后端资源，也不把 `kokoro-gateway` 或任何其他子仓库的源码带入本仓库。

## 1. 一句话结论

Chat 在这里承接：Direct Chat 与 Project Chat 共用一个 `AppFrame`、一个
`SessionEngine` 和一套 `/api/session/*` transport；切换项目只改变 session scope，
不会创建第二套 Chat API。

```text
浏览器
  → /app 或 /app/project/{encoded_project_ref}
  → AppFrame / Composer
  → SessionEngine(scope)
  → /api/session/*（同源 Web BFF）
  → KOKORO_SESSION_BASE_URL 或 KOKORO_GATEWAY_BASE_URL
```

## 2. 路由与 scope

| UI 状态 | canonical route | Session scope | 说明 |
|---|---|---|---|
| Direct Chat 空态/会话 | `/app`、`/app?conversation=SESSION_ID` | `{kind: "direct"}` | 默认个人 Chat 清单 |
| Project overview | `/app/project/{encoded_project_ref}` | `{kind: "project", projectRef}` | 不自动承接 direct 会话 |
| Project task | `/app/project/{encoded_project_ref}?conversation=SESSION_ID` | 同上 | 同一 Composer 创建项目范围会话 |

`project_ref` 是不透明项目引用：路由只解码一次，写入链接和请求时再编码一次。它不是
`site`、tenant、namespace 或用户身份字段。调用方不得预先编码，也不得从浏览器输入中推导
服务端身份。

## 3. 未发送草稿的承接

Direct Chat 选择项目时，当前草稿不是一条已发送消息，也不调用 `POST /messages`。Web
只在本地写入一次性 handoff：

```text
sessionStorage key:
kokoro.web.pending-project-draft:{encodeURIComponent(project_ref)}
value:
用户当前 Composer draft（纯文本）
```

项目路由挂载后，仅当项目 draft 为空时消费该值，写入项目 scope 对应的 draft controller，
然后立即删除 key。这样可以保证：

1. 刷新或重复挂载不会重复追加；
2. 当前项目已有 draft 时不会被覆盖；
3. 草稿不会出现在消息列表、SSE、snapshot 或审计事件中；
4. 发送前仍可编辑、取消或切换项目。

当前本地“新建专案”使用合成引用 `preview-project`，它是 preview route handoff，不是已
持久化的 project-create API 返回值。生产接入 project service 时，先由项目服务返回真实的
opaque `project_ref`，再复用本契约的 Chat scope。

## 4. 已有项目与新建项目入口

| 操作 | 当前行为 | 后端行为 |
|---|---|---|
| Direct Chat → `新增到专案` → `Kokoro` | `/app/project/kokoro`，保留 draft | 不发消息；只写 handoff |
| Direct Chat → `新增到专案` → `新建专案` | `/app/project/preview-project`，保留 draft | 当前为 preview route，不声称 project 已持久化 |
| Project Rail → `+` → `新建专案` | `/app/project/preview-project` | 菜单触发真实 mounted-surface navigation，不新建 direct Chat |
| Project → `新建任务` | `/app/project/{project_ref}?conversation=SESSION_ID` | 创建项目 scope 会话；发送首条消息时才调用 Session API |

所有 mounted-surface navigation 都关闭打开中的 Radix picker，且不会遗留
`body { pointer-events: none }`，因此下一次 Chat/rail 点击仍然可用。

## 5. 共用 HTTP 契约

### 5.1 Session list

```http
GET /api/session/sessions?scope=direct&cursor=CURSOR
GET /api/session/sessions?project_ref=PROJECT_REF&cursor=CURSOR
```

### 5.2 创建消息

```http
POST /api/session/sessions/{session_id}/messages
Content-Type: application/json
```

```json
{
  "idempotency_key": "IDEMPOTENCY_KEY",
  "content": "MESSAGE",
  "model": "MODEL",
  "agent": "AGENT",
  "thinking": true,
  "pinned_skills": ["SKILL"],
  "mcp_servers": ["MCP_SERVER"],
  "project_ref": "PROJECT_REF"
}
```

Direct Chat 不发送 `project_ref`；Project Chat 必须发送当前项目的 opaque reference。模式
胶囊是 Composer 本地状态，不进入这个 body。

### 5.3 Snapshot、SSE 与 control

两种 Chat 共用以下路径和响应 union：

```http
GET  /api/session/sessions/{session_id}
GET  /api/session/sessions/{session_id}/events
POST /api/session/sessions/{session_id}/runs/{run_id}/control
```

SSE 使用 `fetch` stream，断线以 `Last-Event-ID: SEQ` 续接；HITL 使用同一
`run.resume`/`run.cancel` control body。项目 scope 不会改变 event name、snapshot shape、
run id 或 control schema。

### 5.4 服务端边界

- 浏览器只访问同源 `/api/session/*`，不读取 runtime JWT、internal secret 或 gateway 凭据。
- BFF 从 HttpOnly session envelope 派生 Authorization 与服务身份，并生成 `Forwarded`。
- 配置 `KOKORO_GATEWAY_BASE_URL` 后，BFF 后面的 transport 可以切换到独立
  `LordFoxFairy/kokoro-gateway`，浏览器路径和 Chat DTO 不变。
- Gateway 是独立兼容 transport；它不包含本仓库页面、Composer 或 `src/site`。

## 6. 验收清单

- [x] Direct Chat 输入未发送 draft 后选择已有项目，URL、项目 surface 和 draft 同时更新。
- [x] Project picker 在导航完成后关闭，菜单不会阻塞下一次点击。
- [x] Project Rail 的 `+` 菜单选择“新建专案”会进入新的 project route。
- [x] Project 新建任务使用项目 scope，不污染 Direct Chat 清单。
- [x] Project 首条消息与 Direct Chat 使用同一 message/SSE/control contract。
- [x] 预览合成引用和本地 draft 不被描述为真实持久化项目。

实现与测试入口：

```text
src/features/app/kokoro-app-surface.tsx
src/features/app/kokoro-welcome.tsx
src/components/blocks/app-frame/app-frame.tsx
src/components/blocks/workspace-rail/workspace-rail.tsx
tests/ui/app-frame.smoke.test.tsx
tests/ui/kokoro-welcome.test.tsx
```
